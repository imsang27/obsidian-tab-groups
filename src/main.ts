import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { TabGroupsSettings, DEFAULT_SETTINGS } from './settings';
import { TabDragController } from './tab-drag';
import { GroupDragController, splitDirectionAt } from './group-drag';
import { TabMoveTracker } from './tab-move';
import { registerHiddenTabSkip } from './hidden-tab-skip';
import { registerExplorerOpen } from './explorer-open';
import { setLanguage, t } from './i18n';
import { TabGroupsSettingTab } from './settings-tab';

interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean;
}

// 💡 옵시디언 비공개 API 중 이 파일이 쓰는 부분만 타입으로 정의
interface InternalTabs {
    children: WorkspaceLeaf[];
    currentTab?: number;
    removeChild(leaf: WorkspaceLeaf): void;
    insertChild(index: number, leaf: WorkspaceLeaf): void;
}
interface InternalLeaf {
    id: string;
    parent: InternalTabs | null;
    tabHeaderEl?: HTMLElement;
    containerEl: HTMLElement;
}
const internal = (leaf: WorkspaceLeaf) => leaf as unknown as InternalLeaf;

// 💡 그룹 색은 CSS 변수로만 넘깁니다. (색을 쓰는 방식은 styles.css가 정함)
function setGroupColor(el: HTMLElement, color: string) {
    el.style.setProperty('--tab-group-color', color);
    el.style.setProperty('--tab-group-tint', `${color}1A`); // 1A = 약 10% 불투명도
}

// 💡 탭 헤더에서 이 플러그인이 붙인 그룹 표시를 모두 걷어 냅니다.
function clearGroupHeader(header: HTMLElement) {
    header.removeAttribute('data-tab-group-id');
    header.removeClasses(['tab-group-member', 'tab-group-hidden', 'tab-group-drag-source']);
    header.style.removeProperty('--tab-group-color');
    header.style.removeProperty('--tab-group-tint');
    header.style.removeProperty('order');
    removeLegacyInlineColor(header);
}

// 💡 1.0.1 이하 버전이 탭 헤더에 직접 넣었던 색 스타일 (업데이트 뒤에도 남아 있을 수 있음)
function removeLegacyInlineColor(header: HTMLElement) {
    header.style.removeProperty('border-top');
    header.style.removeProperty('background-color');
}

export default class TabGroupsPlugin extends Plugin {
    settings: TabGroupsSettings = { ...DEFAULT_SETTINGS }; // ✨ 셋팅 변수 추가
    groups: Map<string, TabGroupData> = new Map();
    leafGroupMap: WeakMap<WorkspaceLeaf, string> = new WeakMap(); 

    lastClickedLeaf: WorkspaceLeaf | null = null; 
    previousActiveLeaf: WorkspaceLeaf | null = null;
    
    // ✨ 핵심: 브라우저가 화면을 그리기 전에 조작을 끝내버리는 초고속 감시자
    globalObservers: Map<Element, MutationObserver> = new Map();
    
    // ✨ 드래그 피드백용 변수
    currentDropTarget: { node: Node | null, insertAfter: boolean } = { node: null, insertAfter: false };
    draggingGroupId: string | null = null;
    // 💡 라벨 드래그 직후의 클릭 한 번은 무시 (Esc로 취소하고 버튼을 떼면 클릭으로 처리돼 접힘/펼침이 바뀌던 문제)
    ignoreNextLabelClick = false;
    
    // ✨ 탭 하나 드래그(플레이스홀더·드롭) 담당
    tabDrag: TabDragController = new TabDragController(this);
    // ✨ 그룹(라벨) 드래그의 플레이스홀더 담당
    groupDrag: GroupDragController = new GroupDragController();
    
    // ✨ 단축키·다른 플러그인으로 탭을 옮겼을 때의 그룹 편입·이탈 담당
    tabMoves: TabMoveTracker = new TabMoveTracker(this);

    // 💡 onunload가 불렸는지 (비동기 onload가 끝나기 전에 꺼질 수 있음)
    unloaded = false;

    async onload() {
        // ✨ 1. 플러그인이 켜질 때 가장 먼저 데이터를 불러옵니다.
        await this.loadSettings();
        // 🚨 불러오는 사이 꺼졌으면(hot-reload와 plugin:reload가 겹칠 때 등) 여기서 멈춥니다.
        // 꺼진 뒤에 감시자·이벤트를 달면 아무도 떼지 않아, 새로 켜진 인스턴스의 감시자와
        // 서로의 DOM 정렬에 끝없이 반응하며 옵시디언이 멈춥니다.
        if (this.unloaded) return;

        // 👇 옵시디언 화면이 다 켜진 직후에 실행되는 곳
        this.app.workspace.onLayoutReady(() => {
            if (this.unloaded) return;
            this.restoreTabsFromSettings(); // ✨ 탭 매핑 먼저 완벽하게 복구하고!
            this.setupObservers();          // 감시자 달고
            this.enforcePhysicalSorting();  // 화면 정렬!
        });
        
        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const header = target.closest<HTMLElement>('.workspace-tab-header');
            if (header) {
                this.lastClickedLeaf = this.findLeafFromHeader(header);
            } else {
                this.lastClickedLeaf = null;
            }
        }, { capture: true });
        
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.setupObservers();
                this.enforcePhysicalSorting();
            })
        );
        
        // ✨ 옵시디언이 이벤트를 씹어먹기 전에 우리가 먼저(capture: true) 낚아챕니다!
        this.registerDomEvent(window, 'dragenter', this.onDragEnter, { capture: true });
        this.registerDomEvent(window, 'dragover', this.onDragOver, { capture: true });
        this.registerDomEvent(window, 'drop', this.onDrop, { capture: true });
        
        this.tabDrag.register();

        // ✨ 그룹을 끌다가 창 밖으로 나가면 자리 표시 숨기기
        this.registerDomEvent(window, 'dragleave', (e: DragEvent) => {
            if (!e.relatedTarget) {
                this.groupDrag.hide();
                this.groupDrag.hideSplitPreview();
            }
        }, { capture: true });

        // 💡 새로 누르기 시작하면 드래그 뒤 클릭 무시 표시를 지웁니다. (드롭으로 끝나 클릭이 오지 않은 경우)
        this.registerDomEvent(window, 'mousedown', () => { this.ignoreNextLabelClick = false; }, { capture: true });
        
        // ✨ Ctrl+Tab 등으로 탭을 순환할 때 접힌 그룹의 탭은 번쩍임 없이 건너뜀
        registerHiddenTabSkip(this);
        
        // ✨ 탐색기에서 연 노트가 접힌 그룹에 이미 열려 있으면 그 탭으로 이동
        registerExplorerOpen(this);

        this.addSettingTab(new TabGroupsSettingTab(this.app, this));

        // 스마트 펼침 유지
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (!leaf) return;
                
                const headerEl = internal(leaf).tabHeaderEl;
                if (!headerEl) return;

                const children = internal(leaf).parent?.children ?? [];
                const currentIndex = children.indexOf(leaf);
                const prevIndex = this.previousActiveLeaf ? children.indexOf(this.previousActiveLeaf) : -1;
                
                let isSequential = false;
                let direction = 1;
                if (prevIndex !== -1) {
                    if (currentIndex === prevIndex + 1 || (prevIndex === children.length - 1 && currentIndex === 0)) {
                        isSequential = true; direction = 1;
                    } else if (currentIndex === prevIndex - 1 || (prevIndex === 0 && currentIndex === children.length - 1)) {
                        isSequential = true; direction = -1;
                    }
                }
                
                const groupId = this.leafGroupMap.get(leaf);
                if (groupId) {
                    const groupData = this.groups.get(groupId);
                    
                    if (groupData && groupData.isCollapsed) {
                        if (isSequential) {
                            headerEl.classList.add('tab-group-hidden');
                            this.skipHiddenTab(leaf, direction);
                        } else {
                            groupData.isCollapsed = false;
                            this.previousActiveLeaf = leaf;
                            this.enforcePhysicalSorting();
                        }
                    } else {
                        this.previousActiveLeaf = leaf;
                    }
                } else {
                    this.previousActiveLeaf = leaf;
                }
            })
        );
        
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {
                if (source === 'tab-header' && this.lastClickedLeaf) {
                    const targetLeaf = this.lastClickedLeaf; 
                    const currentGroupId = this.leafGroupMap.get(targetLeaf);
                    
                    menu.addSeparator();
                    
                    if (currentGroupId) {
                        menu.addItem((item) => {
                            item.setTitle(t('menu.removeFromGroup'))
                                .setIcon('folder-minus')
                                .onClick(async () => { // 💡 async 추가
                                    this.leafGroupMap.delete(targetLeaf);
                                    await this.saveSettings(); // ✨ 상태 변경 즉시 저장!
                                    this.enforcePhysicalSorting(); 
                                });
                        });
                        menu.addSeparator();
                    }
                    
                    if (this.groups.size > 0) {
                        this.groups.forEach((groupData, groupId) => {
                            if (groupId !== currentGroupId) {
                                menu.addItem((item) => {
                                    item.setTitle(groupData.name ? t('menu.addToGroup', { name: groupData.name }) : t('menu.addToUnnamedGroup'))
                                        .setIcon('folder-input')
                                        .onClick(async () => { // 💡 async 추가
                                            this.leafGroupMap.set(targetLeaf, groupId);
                                            groupData.isCollapsed = false; 
                                            await this.saveSettings(); // ✨ 상태 변경 즉시 저장!
                                            this.enforcePhysicalSorting(); 
                                        });
                                });
                            }
                        });
                        menu.addSeparator();
                    }
                    
                    menu.addItem((item) => {
                        item.setTitle(t('menu.createGroup'))
                            .setIcon('folder-plus')
                            // 💡 콜백 함수에 async 추가!
                            .onClick(() => {
                                new CreateGroupModal(this.app, async (groupName, color) => {
                                    const groupId = 'group-' + Date.now();
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false });
                                    
                                    this.leafGroupMap.set(targetLeaf, groupId);
                                    
                                    // ✨ 그룹이 생성되었으니 data.json에 즉시 저장!
                                    await this.saveSettings();
                                    
                                    this.enforcePhysicalSorting();
                                }).open();
                            });
                    });
                }
            })
        );
    }
    
    // ✨ 2. 데이터 불러오기 함수
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TabGroupsSettings>);
        setLanguage(this.settings.language);
        
        // 불러온 데이터를 바탕으로 this.groups 메모리에 세팅
        this.settings.savedGroups.forEach(g => {
            this.groups.set(g.id, {
                name: g.name,
                color: g.color,
                isCollapsed: g.isCollapsed,
                leafIds: new Set() // 💡 탭 매핑(복구)은 다음 단계에서 구현!
            });
        });
    }
    
    // ✨ 4. 저장된 데이터와 현재 열려있는 탭을 대조해서 복구하는 함수
    restoreTabsFromSettings() {
        this.settings.savedGroups.forEach(savedGroup => {
            const tabs = savedGroup.savedTabs || [];
            
            this.app.workspace.iterateAllLeaves(leaf => {
                // 💡 켜진 탭의 ID가 저장소에 기록되어 있다면 그 그룹으로 쏙!
                if (tabs.includes(internal(leaf).id)) {
                    this.leafGroupMap.set(leaf, savedGroup.id);
                }
            });
        });
    }
    
    // ✨ 3. 데이터 저장하기 함수 (고도화됨)
    async saveSettings() {
        this.settings.savedGroups = [];
        
        this.groups.forEach((groupData, groupId) => {
            // 💡 현재 이 그룹에 속한 탭(Leaf)들의 고유 ID를 수집합니다.
            const tabsInGroup: string[] = [];
            this.app.workspace.iterateAllLeaves(leaf => {
                if (this.leafGroupMap.get(leaf) === groupId) {
                    tabsInGroup.push(internal(leaf).id);
                }
            });

            this.settings.savedGroups.push({
                id: groupId,
                name: groupData.name,
                color: groupData.color,
                isCollapsed: groupData.isCollapsed,
                savedTabs: tabsInGroup // ✨ 수집한 탭 ID들을 저장소에 배열로 기록!
            });
        });
        await this.saveData(this.settings);
    }

    // ✨ 1. 진입 단계 처리
    // 💡 window 리스너로 넘기므로 this가 고정되는 화살표 함수로 정의
    onDragEnter = (e: DragEvent) => {
        if (this.draggingGroupId) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation(); 
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }
    };
    
    // ✨ 2. 그룹을 끄는 동안: 탭 바 안이면 탭 드래그와 같은 플레이스홀더로 들어갈 자리를 보여 줌
    onDragOver = (e: DragEvent) => {
        // 💡 보안 정책에 막히는 getData 대신, 아까 저장해둔 내장 메모리 변수 사용!
        if (!this.draggingGroupId) return; // 💡 단일 탭일 때는 즉시 패스하여 TabDragController로 넘김!

        // 💡 핵심: 그룹 ID가 확인되면, DOM을 탐색하기도 전에 무조건 닥치고 옵시디언부터 차단!
        e.preventDefault();
        e.stopPropagation();
        // 🔥 여기서도 무력 제압 유지
        e.stopImmediatePropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const container = this.findTabBarInner(e.target as HTMLElement);
        if (!container) {
            // 💡 탭 바 밖(에디터 본문 등): 자리 표시는 치우고, 편집 화면 위면 분할 미리보기를 보여 줌 (드롭은 onGroupDrop에서 처리)
            this.groupDrag.hide();
            this.currentDropTarget.node = null;
            const leafEl = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-leaf');
            if (leafEl) this.groupDrag.showSplitPreview(leafEl, splitDirectionAt(leafEl, e.clientX, e.clientY));
            else this.groupDrag.hideSplitPreview();
            return;
        }

        this.groupDrag.hideSplitPreview();
        const target = this.groupDrag.update(container, e.clientX);
        this.currentDropTarget = target ?? { node: null, insertAfter: false };
    };

    findTabBarInner(target: HTMLElement): HTMLElement | null {
        const wrapper = target.closest?.('.workspace-tab-header-container');
        return wrapper ? wrapper.querySelector<HTMLElement>('.workspace-tab-header-container-inner') : null;
    }

    // ✨ 빈 공간 및 탭 드롭 허용 로직
    onDrop = (e: DragEvent) => {
        // 💡 Drop에서도 getData 대신 확실한 내장 메모리를 사용합니다.
        const draggedGroupId = this.draggingGroupId;
        if (!draggedGroupId) return; // 💡 단일 탭 드롭은 TabDragController가 처리

        // 💡 마지막 dragover가 늦게 처리돼도 놓은 좌표 그대로 자리를 한 번 더 맞춥니다.
        const container = this.findTabBarInner(e.target as HTMLElement);
        if (container) this.currentDropTarget = this.groupDrag.update(container, e.clientX) ?? { node: null, insertAfter: false };
        // 💡 플레이스홀더 위에 놓았으면 e.target이 곧 치워지므로, 놓은 곳은 미리 탭 바로 바꿔 둡니다.
        const dropTarget = container ?? e.target as HTMLElement;
        this.groupDrag.finish(); // 플레이스홀더를 치우고 숨겼던 그룹을 되돌린 뒤 옮깁니다.
        this.onGroupDrop(e, draggedGroupId, dropTarget);
    };

    // ✨ 그룹(라벨) 드롭 처리: 창 분할, 다른 창으로 병합, 같은 탭 바 안 재배치
    onGroupDrop(e: DragEvent, draggedGroupId: string, target: HTMLElement) {

        e.preventDefault();
        e.stopPropagation(); // 옵시디언 드롭 이벤트 차단

        
        // 💡 Drop에서도 바깥 래퍼를 기준으로 먼저 찾도록 수정
        const wrapper = target.closest('.workspace-tab-header-container');
        // 💡 핵심 추가: 탭 바 밖(에디터 영역)에 떨어뜨렸을 때 새 창 분할 발동!
        if (!wrapper) {
            const dropLeafEl = target.closest<HTMLElement>('.workspace-leaf');
            if (dropLeafEl) {
                // 옵시디언처럼 가장자리 25%는 그쪽으로 분할, 가운데는 그 창에 합치기 (끄는 동안 보인 미리보기와 같은 판정)
                const splitDirection = splitDirectionAt(dropLeafEl, e.clientX, e.clientY);
                
                // 🔥 3. 진짜 창 분할 및 탭 덩어리 이동 API 시작!
                let targetLeaf: WorkspaceLeaf | null = null;
                this.app.workspace.iterateAllLeaves(leaf => {
                    // 방금 마우스가 떨어진 에디터(.workspace-leaf)의 실제 객체를 찾습니다.
                    if (internal(leaf).containerEl === dropLeafEl) {
                        targetLeaf = leaf;
                    }
                });
                
                if (targetLeaf) {
                    // 드래그 중인 우리 그룹의 탭들을 싹 다 긁어모읍니다.
                    const draggedLeaves: WorkspaceLeaf[] = [];
                    this.app.workspace.iterateAllLeaves(leaf => {
                        if (this.leafGroupMap.get(leaf) === draggedGroupId) {
                            draggedLeaves.push(leaf);
                        }
                    });
                    
                    if (draggedLeaves.length > 0) {
                        if (splitDirection !== 'center') {
                            const direction = (splitDirection === 'left' || splitDirection === 'right') ? 'vertical' : 'horizontal';
                            const before = (splitDirection === 'left' || splitDirection === 'top');
                            
                            // 💡 마법의 트릭: 더미(가짜) 탭을 하나 만들어서 옵시디언이 화면을 쪼개게 만듭니다.
                            const dummyLeaf = this.app.workspace.createLeafBySplit(targetLeaf, direction, before);
                            const newParent = internal(dummyLeaf).parent!; // 새로 쪼개진 공간(부모) 확보!

                            // 💡 우리가 묶어둔 탭들을 새로 쪼개진 방으로 전부 이사시킵니다.
                            draggedLeaves.forEach(leaf => {
                                const oldParent = internal(leaf).parent;
                                if (oldParent) oldParent.removeChild(leaf); // 원래 방에서 빼고
                                // ✨ 핵심 수정: 옵시디언 내부 API에 맞춰 맨 뒤(children.length)에 탭을 밀어 넣습니다.
                                newParent.insertChild(newParent.children.length, leaf); 
                            });

                            // 💡 임무를 다한 더미 탭은 조용히 암살(?)합니다.
                            dummyLeaf.detach();
                        } else {
                            // Center(가운데) 드롭 시: 해당 탭 그룹으로 모두 병합
                            const targetParent = internal(targetLeaf).parent!;
                            draggedLeaves.forEach(leaf => {
                                const oldParent = internal(leaf).parent;
                                if (oldParent !== targetParent) {
                                    if (oldParent) oldParent.removeChild(leaf);
                                    // ✨ 여기도 동일하게 insertChild 사용!
                                    targetParent.insertChild(targetParent.children.length, leaf);
                                }
                            });
                        }
                        
                        // 이사가 끝난 후 첫 번째 탭에 포커스를 줘서 화면 렌더링을 갱신시킵니다!
                        this.app.workspace.setActiveLeaf(draggedLeaves[0]!, { focus: true });
                    }
                }
            }
            return;
        }
        
        // 💡 1. 현재 드롭된 탭 바(wrapper)가 속한 부모 창(targetParent) 찾기
        // (콜백 안에서 채우므로 null로 좁혀지지 않게 선언 타입을 단언으로 지정)
        let targetParent = null as InternalTabs | null;
        this.app.workspace.iterateAllLeaves(leaf => {
            // 이 탭 바 안에 존재하는 탭을 찾으면, 그 탭의 부모가 곧 타겟 창!
            if (wrapper.contains(internal(leaf).tabHeaderEl ?? null)) {
                targetParent = internal(leaf).parent;
            }
        });

        // 💡 2. 내가 드래그하고 있는 탭들의 원래 부모 창(sourceParent) 찾기
        const draggedLeaves: WorkspaceLeaf[] = [];
        let sourceParent = null as InternalTabs | null;
        this.app.workspace.iterateAllLeaves(leaf => {
            if (this.leafGroupMap.get(leaf) === draggedGroupId) {
                draggedLeaves.push(leaf);
                if (!sourceParent) sourceParent = internal(leaf).parent;
            }
        });

        if (!this.currentDropTarget.node) return; // 탭 바 내부 드롭인데 타겟이 없으면 취소

        const container = wrapper.querySelector<HTMLElement>('.workspace-tab-header-container-inner');
        if (!container) return;
        
        const targetNode = this.currentDropTarget.node as HTMLElement;
        const isAfter = this.currentDropTarget.insertAfter;
        
        // 🔥 3. 만약 다른 창의 탭 바에 던졌다면? -> 해당 창으로 통째로 병합 이사!
        let isCrossWindow = false;
        if (targetParent && sourceParent && targetParent !== sourceParent) {
            isCrossWindow = true;

            // ✨ 타겟 위치 정확히 계산 (라벨 위에 떨궜으면 그 다음 요소인 탭을 기준으로 위치 탐색)
            let actualTargetHeader = targetNode;
            if (targetNode.classList.contains('tab-group-label')) {
                actualTargetHeader = targetNode.nextElementSibling as HTMLElement || targetNode;
            }
            
            let targetLeafIndex = targetParent.children.length; 
            const targetLeaf = this.findLeafFromHeader(actualTargetHeader);
            if (targetLeaf) {
                const idx = targetParent.children.indexOf(targetLeaf);
                if (idx !== -1) targetLeafIndex = isAfter ? idx + 1 : idx;
            }
            
            for (const [idx, leaf] of draggedLeaves.entries()) {
                const oldParent = internal(leaf).parent;
                if (oldParent) oldParent.removeChild(leaf);

                // 새 창의 맨 끝이 아닌, 우리가 계산한 위치(targetLeafIndex)에 추가
                targetParent.insertChild(targetLeafIndex + idx, leaf);
            }
        }
        
        // 드래그된 탭들(HTML 요소) 찾기
        // ✨ 수정: 다른 창에서 넘어올 수도 있으니 container 내부가 아닌 전체 문서(document)에서 찾습니다.
        const draggedHeaders = Array.from(document.querySelectorAll<HTMLElement>(`.workspace-tab-header[data-tab-group-id="${draggedGroupId}"]`));
        if (draggedHeaders.length === 0) return;

        // 💡 1. 꼬임 방지를 위해 드래그된 요소들을 화면에서 잠깐 뽑아냄
        const fragment = createFragment();
        draggedHeaders.forEach(h => fragment.appendChild(h));
        
        // 💡 2. Hitbox 판정 결과(앞/뒤)에 따라 정확한 위치에 꽂아 넣음
        if (isAfter) {
            container.insertBefore(fragment, targetNode.nextSibling);
        } else {
            container.insertBefore(fragment, targetNode);
        }
        
        // 💡 3. 화면 순서가 완벽히 배치되었으니, 내부 배열(Leaf)을 정렬시킴 (그룹 통째 이동이라 탭 이동 판정은 끔)
        this.enforcePhysicalSorting({ trackMoves: false });
        
        // 타 창으로 이사했다면 첫 번째 탭에 포커스를 줘서 렌더링 강제 갱신
        if (isCrossWindow && draggedLeaves[0]) {
            this.app.workspace.setActiveLeaf(draggedLeaves[0], { focus: true });
        }
    }
    
    setupObservers() {
        const containers = document.querySelectorAll('.workspace-tab-header-container-inner');
        containers.forEach(container => {
            if (!this.globalObservers.has(container)) {
                const observer = new MutationObserver((mutations) => {
                    // 🚨 꺼진 인스턴스의 감시자가 남아 있으면 스스로 떼어 냅니다. (다른 인스턴스와 핑퐁 방지)
                    if (this.unloaded) { observer.disconnect(); return; }
                    // ✨ 탭을 손으로 잡고 드래그 중이거나 그룹 드래그 중일 때는 절대 간섭하지 않음
                    if (this.draggingGroupId || this.tabDrag.isDragging) return;
                    
                    // ✨ 플레이스홀더 자체의 삽입/제거로 발생한 DOM 변경은 감시 대상에서 제외
                    const isOnlyPlaceholderMutation = mutations.every(m => {
                        const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
                        return nodes.length > 0 && nodes.every(n => 
                            (n as HTMLElement).classList?.contains('tab-group-drag-placeholder')
                        );
                    });
                    if (isOnlyPlaceholderMutation) return;
                    
                    this.enforcePhysicalSorting();
                });
                this.globalObservers.set(container, observer);
                observer.observe(container, { childList: true, attributes: true, attributeFilter: ['class'] });
            }
        });
    }
    
    async shiftFocusOut(groupId: string) {
        const activeHeader = document.querySelector<HTMLElement>('.workspace-tab-header.is-active');
        if (activeHeader && activeHeader.getAttribute('data-tab-group-id') === groupId) {
            const allHeaders = Array.from(document.querySelectorAll<HTMLElement>('.workspace-tab-header'));
            const targetHeader = allHeaders.find(h => h.getAttribute('data-tab-group-id') !== groupId && !h.classList.contains('tab-group-hidden'));
            
            if (targetHeader) {
                const targetLeaf = this.findLeafFromHeader(targetHeader);
                if (targetLeaf) {
                    this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                    await new Promise(resolve => window.setTimeout(resolve, 20));
                }
            }
        }
    }
    
    skipHiddenTab(currentLeaf: WorkspaceLeaf, direction: number) {
        const parent = internal(currentLeaf).parent;
        if (!parent || !Array.isArray(parent.children)) return;

        const children = parent.children;
        const currentIndex = children.indexOf(currentLeaf);
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex + direction;
        let targetLeaf: WorkspaceLeaf | null = null;
        let count = 0;
        
        while (count < children.length) {
            if (nextIndex >= children.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = children.length - 1;
            
            const candidate = children[nextIndex]!;
            const candidateGroupId = this.leafGroupMap.get(candidate);
            
            let isHidden = false;
            if (candidateGroupId) {
                const gData = this.groups.get(candidateGroupId);
                if (gData && gData.isCollapsed) isHidden = true;
            }
            
            if (!isHidden) {
                targetLeaf = candidate;
                break;
            }
            
            nextIndex += direction;
            count++;
        }
        
        if (targetLeaf && targetLeaf !== currentLeaf) {
            window.setTimeout(() => {
                this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
            }, 0);
        }
    }
    
    findLeafFromHeader(headerEl: Element): WorkspaceLeaf | null {
        let targetLeaf: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (internal(leaf).tabHeaderEl === headerEl) {
                targetLeaf = leaf;
            }
        });
        return targetLeaf;
    }
    
    restoreDomAttributes() {
        this.app.workspace.iterateAllLeaves(leaf => {
            const header = internal(leaf).tabHeaderEl;
            if (header) {
                const savedGroupId = this.leafGroupMap.get(leaf);
                if (savedGroupId) {
                    header.setAttribute('data-tab-group-id', savedGroupId);
                    const groupData = this.groups.get(savedGroupId);
                    if (groupData) {
                        // 💡 색은 CSS 변수로만 넘기고, 실제 스타일은 styles.css의 .tab-group-member가 담당
                        header.addClass('tab-group-member');
                        removeLegacyInlineColor(header);
                        setGroupColor(header, groupData.color);
                    }
                } else {
                    clearGroupHeader(header);
                }
            }
        });
    }
    
    isGroupExpanded(groupId: string): boolean {
        return this.groups.get(groupId)?.isCollapsed === false;
    }

    // 💡 접힌 그룹에 속해 탭 바에서 숨겨진 탭인지
    isLeafHidden(leaf: WorkspaceLeaf): boolean {
        const groupId = this.leafGroupMap.get(leaf);
        return !!groupId && this.groups.get(groupId)?.isCollapsed === true;
    }
    
    // 💡 trackMoves: 지난 정렬 뒤 탭 하나가 옮겨졌으면(단축키·Pane Relief 등) 그룹 편입·이탈을 먼저 반영
    enforcePhysicalSorting(options: { trackMoves?: boolean } = {}) {
        // ✨ 무한루프 방지: 우리가 DOM을 엎어버리는 동안에는 감시자를 잠시 끕니다.
        this.globalObservers.forEach(obs => obs.disconnect());
        
        try {
            const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');
            
            let groupChanged = false;
            if (options.trackMoves !== false) {
                tabContainers.forEach(container => {
                    if (this.tabMoves.applyMove(container)) groupChanged = true;
                });
            }
            
            this.restoreDomAttributes();
            
            tabContainers.forEach(container => {
                const headers = Array.from(container.querySelectorAll<HTMLElement>('.workspace-tab-header'));
                const newOrder: { type: string, id?: string, el?: HTMLElement }[] = [];
                const groupBlocks = new Map<string, HTMLElement[]>();
                
                headers.forEach(header => {
                    header.style.removeProperty('order');
                    const groupId = header.getAttribute('data-tab-group-id');
                    
                    if (groupId) {
                        if (!groupBlocks.has(groupId)) {
                            groupBlocks.set(groupId, []);
                            newOrder.push({ type: 'group', id: groupId });
                        }
                        groupBlocks.get(groupId)!.push(header);
                    } else {
                        newOrder.push({ type: 'single', el: header });
                    }
                });
                
                const sortedHeaders: HTMLElement[] = [];
                
                newOrder.forEach(item => {
                    if (item.type === 'single' && item.el) {
                        container.appendChild(item.el);
                        sortedHeaders.push(item.el); 
                    } else if (item.type === 'group' && item.id) {
                        groupBlocks.get(item.id)!.forEach(el => {
                            container.appendChild(el);
                            sortedHeaders.push(el); 
                        });
                    }
                });
                
                const sortedLeaves = sortedHeaders.map(h => this.findLeafFromHeader(h)).filter(l => l !== null);
                if (sortedLeaves.length > 0) {
                    const parentGroup = internal(sortedLeaves[0]!).parent;
                    
                    if (parentGroup && Array.isArray(parentGroup.children)) {
                        if (parentGroup.children.length === sortedLeaves.length) {
                            const activeHeader = sortedHeaders.find(h => h.classList.contains('is-active'));
                            const activeLeaf = activeHeader ? this.findLeafFromHeader(activeHeader) : null;
                            
                            parentGroup.children = sortedLeaves;
                            
                            if (activeLeaf && parentGroup.currentTab !== undefined) {
                                const newActiveIndex = sortedLeaves.indexOf(activeLeaf);
                                if (newActiveIndex !== -1) parentGroup.currentTab = newActiveIndex;
                            }
                        }
                    }
                }
            });
            
            this.renderGroupUI();
            
            tabContainers.forEach(container => this.tabMoves.remember(container));
            if (groupChanged) void this.saveSettings(); // ✨ 그룹 소속이 바뀌었으니 data.json에 저장
        } finally {
            // ✨ 우리 작업이 완벽히 끝나면 감시자를 다시 가동합니다.
            this.globalObservers.forEach((obs, container) => {
                obs.observe(container, { childList: true, attributes: true, attributeFilter: ['class'] });
            });
        }
    }
    
    renderGroupUI() {
        const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');
        
        tabContainers.forEach(container => {
            // 🚨 가장 안정적인 과거 방식: 라벨 무조건 전체 삭제
            container.querySelectorAll('.tab-group-label').forEach(el => el.remove());
            
            const headers = Array.from(container.querySelectorAll<HTMLElement>('.workspace-tab-header'));
            const groupMap = new Map<string, HTMLElement[]>();
            
            headers.forEach(header => {
                const groupId = header.getAttribute('data-tab-group-id');
                if (groupId) {
                    if (!groupMap.has(groupId)) groupMap.set(groupId, []);
                    groupMap.get(groupId)!.push(header);
                } else {
                    header.classList.remove('tab-group-hidden');
                }
            });
            
            groupMap.forEach((groupHeaders, groupId) => {
                const groupData = this.groups.get(groupId);
                if (!groupData) return;
                
                const leader = groupHeaders[0];
                if (!leader) return;
                
                // 🚨 무조건 새로 찍어냄
                this.insertStandaloneLabel(leader, groupId, groupData);
                
                // 💡 숨김 스타일(display: none !important 등)은 styles.css의 .tab-group-hidden이 담당
                groupHeaders.forEach(header => header.classList.toggle('tab-group-hidden', groupData.isCollapsed));
            });
        });
    }
    
    async toggleCollapsed(groupId: string, groupData: TabGroupData) {
        if (!groupData.isCollapsed) {
            await this.shiftFocusOut(groupId);
        }

        groupData.isCollapsed = !groupData.isCollapsed; // 1. 접힘 상태 반전 (열림 -> 닫힘 / 닫힘 -> 열림)
        await this.saveSettings();                      // ✨ 2. 핵심 수정: 상태가 바뀌었으니 data.json에 즉시 덮어쓰기!
        this.enforcePhysicalSorting();                  // 3. 화면 업데이트
    }

    insertStandaloneLabel(leaderEl: HTMLElement, groupId: string, groupData: TabGroupData) {
        const container = leaderEl.parentElement;
        if (!container) return;
        
        const labelEl = createDiv({ cls: 'tab-group-label' });
        labelEl.setAttribute('data-group-id', groupId);

        labelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.ignoreNextLabelClick) {
                this.ignoreNextLabelClick = false;
                return;
            }
            void this.toggleCollapsed(groupId, groupData);
        });
        
        // ✨ 수정: 3가지 액션(닫기, 삭제, 해제)을 각각 다르게 처리하는 로직 추가
        labelEl.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault(); // 기본 브라우저 우클릭 메뉴 차단
            
            new EditGroupModal(
                this.app, 
                groupData.name, 
                groupData.color, 
                // 1. 저장(onSubmit) 콜백
                async (newName, newColor) => {
                    groupData.name = newName;
                    groupData.color = newColor;
                    await this.saveSettings();
                    this.enforcePhysicalSorting();
                },
                // 2. 액션(onAction) 콜백 - 닫기, 삭제, 해제 통합 처리
                async (action: 'close' | 'delete' | 'ungroup') => { 
                    if (action === 'close') {
                        // [그룹 닫기]: 그룹에 속한 탭을 '실제로 모두 닫고', 그룹도 삭제
                        // (주의: 반복문 도중 탭을 닫으면 트리가 꼬이므로 배열에 모아두었다가 한 번에 닫음)
                        const leavesToClose: WorkspaceLeaf[] = [];
                        this.app.workspace.iterateAllLeaves(leaf => {
                            if (this.leafGroupMap.get(leaf) === groupId) {
                                leavesToClose.push(leaf);
                            }
                        });
                        
                        leavesToClose.forEach(leaf => leaf.detach()); // 네이티브 탭 닫기 명령
                        this.groups.delete(groupId);
                    }
                    else if (action === 'delete') {
                        // [그룹 삭제]: 탭을 일반 탭으로 풀고, 그룹 데이터도 완전히 삭제
                        this.app.workspace.iterateAllLeaves(leaf => {
                            if (this.leafGroupMap.get(leaf) === groupId) {
                                this.leafGroupMap.delete(leaf);
                            }
                        });
                        // ✨ 그룹 데이터 완전 삭제
                        this.groups.delete(groupId);
                    }
                    else if (action === 'ungroup') {
                        // [그룹 해제]: 탭만 일반 탭으로 풀고, 그룹 데이터는 유지
                        this.app.workspace.iterateAllLeaves(leaf => {
                            if (this.leafGroupMap.get(leaf) === groupId) {
                                this.leafGroupMap.delete(leaf);
                            }
                        });
                    }
                    
                    await this.saveSettings();
                    this.enforcePhysicalSorting();
                }
            ).open();
        });
        
        labelEl.draggable = true;
        labelEl.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('application/x-tab-group-id', groupId);
            e.dataTransfer!.effectAllowed = 'move';
            
            this.draggingGroupId = groupId; // 💡 드래그 시작! 무슨 그룹인지 내장 메모리에 꽉 저장!
            document.body.classList.add('is-dragging-tab-group'); // 드래그 시작 시 body에 신호 보내기
            // 크롬처럼 그룹의 탭은 접고 라벨만 끕니다. (반투명 잔상도 라벨 모습 그대로)
            this.groupDrag.start(groupId, labelEl);
        });
        labelEl.addEventListener('dragend', () => {
            this.draggingGroupId = null; // 💡 마우스 놓으면 까먹기 (초기화)
            this.ignoreNextLabelClick = true; // Esc 취소 뒤 버튼을 뗄 때 오는 클릭으로 접힘 상태가 바뀌지 않게
            this.groupDrag.finish(); // 혹시 남은 플레이스홀더를 치우고 숨겼던 그룹을 되돌림
            document.body.classList.remove('is-dragging-tab-group'); // 드래그 종료 시 body 신호 제거
        });
        
        labelEl.setText(groupData.name);
        setGroupColor(labelEl, groupData.color);
        
        // 리더 탭 앞에 삽입
        container.insertBefore(labelEl, leaderEl);
    }

    onunload() {
        this.unloaded = true;

        this.tabDrag.unload();
        this.groupDrag.finish();
        this.globalObservers.forEach(obs => obs.disconnect());
        document.querySelectorAll('.tab-group-label').forEach(el => el.remove());
        // 🚨 탭 헤더를 원래 모습으로 되돌립니다. (그대로 두면 끈 뒤에도 접힌 그룹의 탭이 숨겨진 채 남음)
        this.app.workspace.iterateAllLeaves(leaf => {
            const header = internal(leaf).tabHeaderEl;
            if (header) clearGroupHeader(header);
        });
        document.body.removeClasses(['is-dragging-tab', 'is-dragging-tab-in-tab-bar', 'is-dragging-tab-group']);
    }
}

class CreateGroupModal extends Modal {
    groupName: string = '';
    groupColor: string = '#ff5c5c'; 
    onSubmit: (groupName: string, color: string) => void | Promise<void>;
    
    constructor(app: App, onSubmit: (groupName: string, color: string) => void | Promise<void>) {
        super(app);
        this.onSubmit = onSubmit;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: t('modal.createTitle') });
        
        new Setting(contentEl)
            .setName(t('modal.name'))
            .setDesc(t('modal.nameDesc'))
            .addText((text) => text.onChange((val) => this.groupName = val));
        
        const colorSetting = new Setting(contentEl)
            .setName(t('modal.color'));
        
        // 기존의 투박한 기본 피커를 날려버리고, 우리가 만든 예쁜 팔레트로 대체!
        colorSetting.controlEl.empty();
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });
        
        new Setting(contentEl)
            .addButton((btn) => btn.setButtonText(t('modal.create')).setCta().onClick(() => {
                this.close();
                void this.onSubmit(this.groupName, this.groupColor);
            }));
    }
    
    onClose() { 
        const { contentEl } = this;
        contentEl.empty(); 
    }
}

// ✨ 수정: 3가지 액션(덛가, 삭제, 해제) 버튼을 직관적으로 제공하는 관리 모달
class EditGroupModal extends Modal {
    groupName: string;
    groupColor: string; 
    onSubmit: (groupName: string, color: string) => void | Promise<void>;
    onAction: (action: 'close' | 'delete' | 'ungroup') => void | Promise<void>;
    
    constructor(
        app: App, 
        initialName: string, 
        initialColor: string, 
        onSubmit: (groupName: string, color: string) => void | Promise<void>, 
        onAction: (action: 'close' | 'delete' | 'ungroup') => void | Promise<void>
        ) {
        super(app);
        this.groupName = initialName;
        this.groupColor = initialColor;
        this.onSubmit = onSubmit;
        this.onAction = onAction;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: t('modal.editTitle') });
        
        new Setting(contentEl)
            .setName(t('modal.name'))
            .addText((text) => {
                text.setValue(this.groupName);
                text.onChange((val) => this.groupName = val);
            });
            
        const colorSetting = new Setting(contentEl)
            .setName(t('modal.color'));
        
        colorSetting.controlEl.empty();
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });
        
        // ✨ 3가지 액션 버튼 영역 (닫기, 삭제, 해제를 한 줄에 나란히 배치)
        new Setting(contentEl)
            .setName(t('modal.actions'))
            .addButton((btn) => btn
                .setButtonText(t('modal.closeTabs'))
                .setTooltip(t('modal.closeTabsTip'))
                .setWarning() // 노란색/빨간색 경고
                .onClick(() => { this.close(); void this.onAction('close'); })
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.deleteGroup'))
                .setTooltip(t('modal.deleteGroupTip'))
                .setWarning() // 노란색/빨간색 경고
                .onClick(() => { this.close(); void this.onAction('delete'); })
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.ungroup'))
                .setTooltip(t('modal.ungroupTip'))
                .onClick(() => { this.close(); void this.onAction('ungroup'); })
            );
            
        // ✨ 맨 하단 저장 버튼
        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText(t('modal.save'))
                .setCta() // 파란색 강조 스타일 적용
                .onClick(() => {
                    this.close();
                    void this.onSubmit(this.groupName, this.groupColor);
                }));
    }
    
    onClose() { 
        const { contentEl } = this;
        contentEl.empty(); 
    }
}

// ✨ 수정: 묵직한 미드톤(Mid-tone) 색상으로 변경
const PRESET_COLORS = [
    '#808080', // 그레이 (Gray)
    '#5A8EE6', // 파란색 (Blue)
    '#E66A6A', // 빨간색 (Red)
    '#E5B55C', // 노란색 (Yellow)
    '#6CB86C', // 초록색 (Green)
    '#E673B3', // 핑크색 (Pink)
    '#A478E6', // 보라색 (Purple)
    '#56B6C2', // 하늘색 (Sky Blue)
    '#E6955C'  // 주황색 (Orange)
];

// ✨ UX 개선: 스포이드 시작 색상이 항상 현재 선택된 색상과 동기화되도록 개선된 함수
function renderColorPalette(containerEl: HTMLElement, currentColor: string, onChange: (newColor: string) => void) {
    // 💡 팔레트 모양(크기·테두리·호버 확대 등)은 styles.css의 .tab-group-color-* 클래스가 담당
    const paletteContainer = containerEl.createDiv({ cls: 'tab-group-color-palette' });
        
    let activeCircle: HTMLElement | null = null;
    let customInput: HTMLInputElement; // ✨ 아래에서 생성할 input을 미리 선언해둠 (스코프 공유)
    
    function updateActive(circle: HTMLElement) {
        activeCircle?.removeClass('is-selected');
        circle.addClass('is-selected');
        activeCircle = circle;
    }
    
    // 1. 프리셋 컬러 버튼들 생성
    PRESET_COLORS.forEach(color => {
        const circle = paletteContainer.createDiv({ cls: 'tab-group-color-swatch' });
        setGroupColor(circle, color);
        
        // 현재 색상과 일치하면 활성화 테두리 표시
        if (color.toLowerCase() === currentColor.toLowerCase()) {
            updateActive(circle);
        }
        
        circle.addEventListener('click', () => {
            updateActive(circle);
            if (customInput) customInput.value = color; // ✨ 프리셋 클릭 시 스포이드 시작 색상도 실시간 동기화!
            onChange(color);
        });
    });
    
    // 2. 커스텀 스포이드 버튼 생성
    const customWrapper = paletteContainer.createDiv({ cls: 'tab-group-color-custom' }); // 무지개색 커스텀 아이콘
    
    customInput = customWrapper.createEl('input', { type: 'color' });
    
    // ✨ 모달을 처음 열었을 때, 기존 그룹의 색상으로 스포이드(input) 시작 색상 세팅
    // (네이티브 input type="color"는 7자리 HEX 폼을 요구하므로 유효성 검사 추가)
    customInput.value = (currentColor && currentColor.length === 7) ? currentColor : '#000000';
    
    // 프리셋에 없는 색상일 경우 무지개 버튼에 활성화 테두리 표시
    const isPreset = PRESET_COLORS.some(c => c.toLowerCase() === currentColor.toLowerCase());
    if (!isPreset) {
        updateActive(customWrapper);
    }
    
    customInput.addEventListener('input', (e) => {
        const newColor = (e.target as HTMLInputElement).value;
        updateActive(customWrapper);
        onChange(newColor);
    });
}