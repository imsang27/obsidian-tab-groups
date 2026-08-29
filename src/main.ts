import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

// ✨ 플러그인이 data.json에 저장할 데이터의 형태를 정의
interface SavedGroupData {
    id: string;
    name: string;
    color: string;
    isCollapsed: boolean;
    // 💡 나중에 탭(Leaf) 매핑 데이터를 저장할 배열
    savedTabs: string[]; 
}
interface TabGroupsSettings {
    savedGroups: SavedGroupData[];
}

const DEFAULT_SETTINGS: TabGroupsSettings = {
    savedGroups: []
}

interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean; 
}

export default class TabGroupsPlugin extends Plugin {
    settings: TabGroupsSettings; // ✨ 셋팅 변수 추가
    groups: Map<string, TabGroupData> = new Map();
    leafGroupMap: WeakMap<WorkspaceLeaf, string> = new WeakMap(); 

    lastClickedLeaf: WorkspaceLeaf | null = null; 
    previousActiveLeaf: WorkspaceLeaf | null = null;
    
    // ✨ 핵심: 브라우저가 화면을 그리기 전에 조작을 끝내버리는 초고속 감시자
    globalObservers: Map<Element, MutationObserver> = new Map();
    
    // ✨ 드래그 피드백용 변수
    dropIndicatorEl: HTMLElement = document.createElement('div');
    currentDropTarget: { node: Node | null, insertAfter: boolean } = { node: null, insertAfter: false };
    draggingGroupId: string | null = null; // 💡 요것 추가! (현재 쥐고 있는 그룹 기억용)

    async onload() {
        console.log('🚀 Tab Groups 로드됨 (옵시디언 드래그 간섭 차단 캡처 이벤트 적용)');

        // ✨ 1. 플러그인이 켜질 때 가장 먼저 데이터를 불러옵니다.
        await this.loadSettings();
        
        // 👇 옵시디언 화면이 다 켜진 직후에 실행되는 곳
        this.app.workspace.onLayoutReady(() => {
            this.restoreTabsFromSettings(); // ✨ 탭 매핑 먼저 완벽하게 복구하고!
            this.setupObservers();          // 감시자 달고
            this.enforcePhysicalSorting();  // 화면 정렬!
        });

        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const header = target.closest('.workspace-tab-header') as HTMLElement | null;
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
        this.onDragOver = this.onDragOver.bind(this);
        this.onDrop = this.onDrop.bind(this);
        window.addEventListener('dragenter', this.onDragEnter, { capture: true });
        window.addEventListener('dragover', this.onDragOver, { capture: true });
        window.addEventListener('drop', this.onDrop, { capture: true });

        // ✨ 인디케이터 세팅 및 마우스가 밖으로 나가면 가이드라인 숨기기
        this.dropIndicatorEl.className = 'tab-group-drop-indicator';
        window.addEventListener('dragleave', (e: DragEvent) => {
            if (!e.relatedTarget) this.dropIndicatorEl.style.display = 'none';
        }, { capture: true });

        // 스마트 펼침 유지
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (!leaf) return;
                
                const headerEl = (leaf as any).tabHeaderEl as HTMLElement;
                if (!headerEl) return;

                const parent = (leaf as any).parent;
                const children = parent?.children as WorkspaceLeaf[] || [];
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
                            headerEl.style.setProperty('display', 'none', 'important');
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
                            item.setTitle('❌ 그룹에서 제외')
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
                                    item.setTitle(`🎨 [${groupData.name}] 그룹에 넣기`)
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
                        item.setTitle('✨ 새 탭 그룹 만들기')
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
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
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
                if (tabs.includes((leaf as any).id)) {
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
                    tabsInGroup.push((leaf as any).id);
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

    // ✨ 1. 진입 단계부터 옵시디언의 방어막 완전 박살내기 (무력 제압)
    onDragEnter(e: DragEvent) {
        if (this.draggingGroupId) {
            e.preventDefault();
            e.stopPropagation();
            // 🔥 핵심: 다른 그 어떤 옵시디언 코어 이벤트도 실행되지 못하도록 즉각 차단!
            e.stopImmediatePropagation(); 
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        }
    }

    // ✨ 2. 빈 공간 타겟 그물망 넓히기
    onDragOver(e: DragEvent) {
        // 💡 보안 정책에 막히는 getData 대신, 아까 저장해둔 내장 메모리 변수 사용!
        const draggedGroupId = this.draggingGroupId;
        if (!draggedGroupId) return;

        // 💡 핵심: 그룹 ID가 확인되면, DOM을 탐색하기도 전에 무조건 닥치고 옵시디언부터 차단!
        e.preventDefault();
        e.stopPropagation();
        // 🔥 여기서도 무력 제압 유지
        e.stopImmediatePropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const target = e.target as HTMLElement;
        const wrapper = target.closest('.workspace-tab-header-container');
        
        // 💡 수정된 부분: 탭 바가 아니더라도, 에디터 본문(.workspace-leaf) 위라면 허용!
        if (!wrapper) {
            this.dropIndicatorEl.style.display = 'none';
            this.currentDropTarget.node = null;
            
            // 에디터 본문 영역인지 확인
            const isEditorBody = target.closest('.workspace-leaf-content') || target.closest('.view-header');
            if (isEditorBody) {
                // 드롭을 허용하기 위해 preventDefault 유지 (아무것도 안 하고 통과시킴)
                return;
            }
            return;
        }

        const container = wrapper.querySelector('.workspace-tab-header-container-inner') as HTMLElement;
        if (!container) return;

        if (this.dropIndicatorEl.parentElement !== container) {
            container.appendChild(this.dropIndicatorEl);
            container.style.position = 'relative'; // 절대 좌표 기준점 설정
        }

        // 💡 3. 핵심 방어선 추가: 스페이서뿐만 아니라 그 밑바닥인 래퍼(container) 자체를 짚어도 빈 공간으로 인정!
        const isRightSpace = target.classList.contains('workspace-tab-header-spacer') || 
                             target.classList.contains('workspace-tab-header-container') || // ✨ 그물망 추가!
                             target.closest('.workspace-tab-header-new-tab') ||
                             target.closest('.workspace-tab-header-tab-list') ||
                             target.closest('.sidebar-toggle-button');

        const containerRect = container.getBoundingClientRect();

        // 💡 2. 마우스가 우측 빈 공간 영역에 있다면 무조건 맨 끝으로 판정!
        if (isRightSpace) {
            const visibleChildren = Array.from(container.children).filter(el => {
                if (el === this.dropIndicatorEl) return false;
                if (!el.classList.contains('workspace-tab-header') && !el.classList.contains('tab-group-label')) return false;
                if (window.getComputedStyle(el).display === 'none') return false; 
                
                const elGroupId = el.getAttribute('data-tab-group-id') || el.getAttribute('data-group-id');
                if (elGroupId === draggedGroupId) return false; 
                return true;
            }) as HTMLElement[];

            if (visibleChildren.length > 0) {
                this.dropIndicatorEl.style.display = 'block';
                const lastEl = visibleChildren[visibleChildren.length - 1];
                const rect = lastEl.getBoundingClientRect();
                
                this.dropIndicatorEl.style.left = `${rect.right - containerRect.left + 5}px`;
                this.currentDropTarget = { node: lastEl, insertAfter: true };
            }
            return; // 💡 더 이상 아래 로직 볼 필요 없이 여기서 끝!
        }

        // 💡 3. 마우스가 정상적인 탭/라벨 영역(inner 내부)에 있을 때의 기존 로직
        const dropHeader = target.closest('.workspace-tab-header') as HTMLElement;
        const dropLabel = target.closest('.tab-group-label') as HTMLElement;
        // 💡 핵심: 스페이서 위라면 hoverTarget를 '빈 공간' 로직을 타게 합니다.
        const hoverTarget = dropHeader || dropLabel;

        if (hoverTarget) {
            const hoverGroupId = hoverTarget.getAttribute('data-tab-group-id') || hoverTarget.getAttribute('data-group-id');

            // 💡 1. 자기 자신(자신의 탭이나 라벨) 위에 드롭하는 엣지 케이스 완벽 차단
            if (hoverGroupId === draggedGroupId) {
                this.dropIndicatorEl.style.display = 'none';
                this.currentDropTarget.node = null;
                return;
            }

            this.dropIndicatorEl.style.display = 'block';

            // 💡 Hitbox 마법: 마우스가 요소의 절반을 넘었는지(오른쪽) 안 넘었는지(왼쪽) 계산!
            const rect = hoverTarget.getBoundingClientRect();
            const isAfter = e.clientX > rect.left + rect.width / 2;

            if (hoverGroupId) {
                // 💡 2. 다른 그룹 위에 올렸을 때 -> 그룹을 하나의 덩어리로 보고 맨 앞/맨 뒤로만 안내
                const groupEls = Array.from(container.children).filter(el =>
                    el.getAttribute('data-tab-group-id') === hoverGroupId ||
                    el.getAttribute('data-group-id') === hoverGroupId
                );
                
                const firstEl = groupEls[0] as HTMLElement;
                const lastEl = groupEls[groupEls.length - 1] as HTMLElement;

                if (isAfter) {
                    // 해당 그룹 전체의 뒤쪽으로
                    const lastRect = lastEl.getBoundingClientRect();
                    this.dropIndicatorEl.style.left = `${lastRect.right - containerRect.left}px`;
                    this.currentDropTarget = { node: lastEl, insertAfter: true };
                } else {
                    // 해당 그룹 전체의 앞쪽으로
                    const firstRect = firstEl.getBoundingClientRect();
                    this.dropIndicatorEl.style.left = `${firstRect.left - containerRect.left}px`;
                    this.currentDropTarget = { node: firstEl, insertAfter: false };
                }
            } else {
                this.dropIndicatorEl.style.display = 'block';
                this.dropIndicatorEl.style.left = isAfter
                    ? `${rect.right - containerRect.left}px`
                    : `${rect.left - containerRect.left}px`;
                this.currentDropTarget = { node: hoverTarget, insertAfter: isAfter };
            }
        } else {
            // hoverTarget이 없는 빈 영역 (inner 안의 여백 등) 방어 코드
            this.dropIndicatorEl.style.display = 'none';
            this.currentDropTarget.node = null;
        }
    }

    // ✨ 빈 공간 드롭 허용 로직 적용
    onDrop(e: DragEvent) {
        // 💡 Drop에서도 getData 대신 확실한 내장 메모리를 사용합니다.
        const draggedGroupId = this.draggingGroupId;
        this.dropIndicatorEl.style.display = 'none'; // 드롭 시 인디케이터 숨김
        
        if (!draggedGroupId) return; // 💡 조건 완화: currentDropTarget.node가 없어도 통과시킴
        
        e.preventDefault();
        e.stopPropagation(); // 옵시디언 드롭 이벤트 차단
        
        const target = e.target as HTMLElement;
        
        // 💡 Drop에서도 바깥 래퍼를 기준으로 먼저 찾도록 수정
        const wrapper = target.closest('.workspace-tab-header-container');
        // 💡 핵심 추가: 탭 바 밖(에디터 영역)에 떨어뜨렸을 때 새 창 분할 발동!
        if (!wrapper) {
            const dropLeafEl = target.closest('.workspace-leaf') as HTMLElement;
            if (dropLeafEl) {
                // 1. 드롭된 에디터 화면의 크기와 현재 마우스 좌표 계산
                const rect = dropLeafEl.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // 2. 옵시디언처럼 화면을 가장자리 25% 영역으로 나눔 (판정 박스)
                const edgeX = rect.width * 0.25;
                const edgeY = rect.height * 0.25;
                
                let splitDirection = 'center';                               // 기본값: 현재 창에 합치기 
                
                // 3. 마우스 위치에 따른 상하좌우 분할 판정
                if (x < edgeX) splitDirection = 'left';                      // 수직 분할 (왼쪽)
                else if (x > rect.width - edgeX) splitDirection = 'right';   // 수직 분할 (오른쪽)
                else if (y < edgeY) splitDirection = 'top';                  // 수평 분할 (위)
                else if (y > rect.height - edgeY) splitDirection = 'bottom'; // 수평 분할 (아래)
                
                // 🔥 3. 진짜 창 분할 및 탭 덩어리 이동 API 시작!
                let targetLeaf: WorkspaceLeaf | null = null;
                this.app.workspace.iterateAllLeaves(leaf => {
                    // 방금 마우스가 떨어진 에디터(.workspace-leaf)의 실제 객체를 찾습니다.
                    if ((leaf as any).containerEl === dropLeafEl) {
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
                            const newParent = (dummyLeaf as any).parent; // 새로 쪼개진 공간(부모) 확보!

                            // 💡 우리가 묶어둔 탭들을 새로 쪼개진 방으로 전부 이사시킵니다.
                            draggedLeaves.forEach(leaf => {
                                const oldParent = (leaf as any).parent;
                                if (oldParent) oldParent.removeChild(leaf); // 원래 방에서 빼고
                                // ✨ 핵심 수정: 옵시디언 내부 API에 맞춰 맨 뒤(children.length)에 탭을 밀어 넣습니다.
                                newParent.insertChild(newParent.children.length, leaf); 
                            });

                            // 💡 임무를 다한 더미 탭은 조용히 암살(?)합니다.
                            dummyLeaf.detach();
                        } else {
                            // Center(가운데) 드롭 시: 해당 탭 그룹으로 모두 병합
                            const targetParent = (targetLeaf as any).parent;
                            draggedLeaves.forEach(leaf => {
                                const oldParent = (leaf as any).parent;
                                if (oldParent !== targetParent) {
                                    if (oldParent) oldParent.removeChild(leaf);
                                    // ✨ 여기도 동일하게 insertChild 사용!
                                    targetParent.insertChild(targetParent.children.length, leaf);
                                }
                            });
                        }
                        
                        // 이사가 끝난 후 첫 번째 탭에 포커스를 줘서 화면 렌더링을 갱신시킵니다!
                        this.app.workspace.setActiveLeaf(draggedLeaves[0], { focus: true });
                    }
                }
            }
            return;
        }
        
        // 💡 1. 현재 드롭된 탭 바(wrapper)가 속한 부모 창(targetParent) 찾기
        let targetParent: any = null;
        this.app.workspace.iterateAllLeaves(leaf => {
            // 이 탭 바 안에 존재하는 탭을 찾으면, 그 탭의 부모가 곧 타겟 창!
            if (wrapper.contains((leaf as any).tabHeaderEl)) {
                targetParent = (leaf as any).parent;
            }
        });
        
        // 💡 2. 내가 드래그하고 있는 탭들의 원래 부모 창(sourceParent) 찾기
        const draggedLeaves: WorkspaceLeaf[] = [];
        let sourceParent: any = null;
        this.app.workspace.iterateAllLeaves(leaf => {
            if (this.leafGroupMap.get(leaf) === draggedGroupId) {
                draggedLeaves.push(leaf);
                if (!sourceParent) sourceParent = (leaf as any).parent;
            }
        });
        
        if (!this.currentDropTarget.node) return; // 탭 바 내부 드롭인데 타겟이 없으면 취소
        
        const container = wrapper.querySelector('.workspace-tab-header-container-inner') as HTMLElement;
        if (!container) return;
        
        const targetNode = this.currentDropTarget.node as HTMLElement;
        const isAfter = this.currentDropTarget.insertAfter;
        
        // 🔥 3. 만약 다른 창의 탭 바에 던졌다면? -> 해당 창으로 통째로 병합 이사!
        let isCrossWindow = false;
        if (targetParent && sourceParent && targetParent !== sourceParent) {
            isCrossWindow = true;
            console.log(`🔥 [${draggedGroupId}] 그룹 -> 다른 창의 탭 바로 병합 이사합니다!`);
            
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
            
            draggedLeaves.forEach((leaf, idx) => {
                const oldParent = (leaf as any).parent;
                if (oldParent) oldParent.removeChild(leaf);
                
                // 새 창의 맨 끝이 아닌, 우리가 계산한 위치(targetLeafIndex)에 추가
                targetParent.insertChild(targetLeafIndex + idx, leaf);
            });
        }
        
        // 드래그된 탭들(HTML 요소) 찾기
        // ✨ 수정: 다른 창에서 넘어올 수도 있으니 container 내부가 아닌 전체 문서(document)에서 찾습니다.
        const draggedHeaders = Array.from(document.querySelectorAll(`.workspace-tab-header[data-tab-group-id="${draggedGroupId}"]`)) as HTMLElement[];
        if (draggedHeaders.length === 0) return;

        // 💡 1. 꼬임 방지를 위해 드래그된 요소들을 화면에서 잠깐 뽑아냄
        const fragment = document.createDocumentFragment();
        draggedHeaders.forEach(h => fragment.appendChild(h));

        // 💡 2. Hitbox 판정 결과(앞/뒤)에 따라 정확한 위치에 꽂아 넣음
        if (isAfter) {
            container.insertBefore(fragment, targetNode.nextSibling);
        } else {
            container.insertBefore(fragment, targetNode);
        }

        // 💡 3. 화면 순서가 완벽히 배치되었으니, 내부 배열(Leaf)을 정렬시킴
        this.enforcePhysicalSorting();

        // 타 창으로 이사했다면 첫 번째 탭에 포커스를 줘서 렌더링 강제 갱신
        if (isCrossWindow && draggedLeaves.length > 0) {
            this.app.workspace.setActiveLeaf(draggedLeaves[0], { focus: true });
        }
    }

    setupObservers() {
        const containers = document.querySelectorAll('.workspace-tab-header-container-inner');
        containers.forEach(container => {
            if (!this.globalObservers.has(container)) {
                const observer = new MutationObserver(() => {
                    this.enforcePhysicalSorting(); // 훼손 감지 즉시 강제 정렬 및 재생성
                });
                this.globalObservers.set(container, observer);
                observer.observe(container, { childList: true, attributes: true, attributeFilter: ['class'] });
            }
        });
    }

    async shiftFocusOut(groupId: string) {
        let activeHeader = document.querySelector('.workspace-tab-header.is-active') as HTMLElement;
        if (activeHeader && activeHeader.getAttribute('data-tab-group-id') === groupId) {
            const allHeaders = Array.from(document.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const targetHeader = allHeaders.find(h => h.getAttribute('data-tab-group-id') !== groupId && !h.classList.contains('tab-group-hidden'));
            
            if (targetHeader) {
                const targetLeaf = this.findLeafFromHeader(targetHeader);
                if (targetLeaf) {
                    await this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                    await new Promise(resolve => setTimeout(resolve, 20)); 
                }
            }
        }
    }

    skipHiddenTab(currentLeaf: WorkspaceLeaf, direction: number) {
        const parent = (currentLeaf as any).parent;
        if (!parent || !Array.isArray(parent.children)) return;
        
        const children = parent.children as WorkspaceLeaf[];
        const currentIndex = children.indexOf(currentLeaf);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex + direction;
        let targetLeaf: WorkspaceLeaf | null = null;
        let count = 0;

        while (count < children.length) {
            if (nextIndex >= children.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = children.length - 1;

            const candidate = children[nextIndex];
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
            setTimeout(() => {
                this.app.workspace.setActiveLeaf(targetLeaf!, { focus: true });
            }, 0);
        }
    }

    findLeafFromHeader(headerEl: Element): WorkspaceLeaf | null {
        let targetLeaf: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if ((leaf as any).tabHeaderEl === headerEl) {
                targetLeaf = leaf;
            }
        });
        return targetLeaf;
    }

    restoreDomAttributes() {
        this.app.workspace.iterateAllLeaves(leaf => {
            const header = (leaf as any).tabHeaderEl as HTMLElement;
            if (header) {
                const savedGroupId = this.leafGroupMap.get(leaf);
                if (savedGroupId) {
                    header.setAttribute('data-tab-group-id', savedGroupId);
                    const groupData = this.groups.get(savedGroupId);
                    if (groupData) {
                        header.style.borderTop = `3px solid ${groupData.color}`;
                        header.style.backgroundColor = `${groupData.color}1A`;
                    }
                } else {
                    header.removeAttribute('data-tab-group-id');
                    header.style.borderTop = '';
                    header.style.backgroundColor = '';
                }
            }
        });
    }

    enforcePhysicalSorting() {
        // ✨ 무한루프 방지: 우리가 DOM을 엎어버리는 동안에는 감시자를 잠시 끕니다.
        this.globalObservers.forEach(obs => obs.disconnect());

        try {
            this.restoreDomAttributes();

            const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');

            tabContainers.forEach(container => {
                const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
                const newOrder: { type: string, id?: string, el?: HTMLElement }[] = [];
                const groupBlocks = new Map<string, HTMLElement[]>();

                headers.forEach(header => {
                    header.style.order = ''; 
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
                    const parentGroup = (sortedLeaves[0] as any).parent;
                    
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

            const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const groupMap = new Map<string, HTMLElement[]>();

            headers.forEach(header => {
                const groupId = header.getAttribute('data-tab-group-id');
                if (groupId) {
                    if (!groupMap.has(groupId)) groupMap.set(groupId, []);
                    groupMap.get(groupId)!.push(header);
                } else {
                    header.classList.remove('tab-group-hidden');
                    header.style.removeProperty('display');
                }
            });

            groupMap.forEach((groupHeaders, groupId) => {
                const groupData = this.groups.get(groupId);
                if (!groupData) return;

                const leader = groupHeaders[0];
                
                // 🚨 무조건 새로 찍어냄
                this.insertStandaloneLabel(leader, groupId, groupData);

                groupHeaders.forEach(header => {
                    if (groupData.isCollapsed) {
                        header.classList.add('tab-group-hidden');
                        header.style.setProperty('display', 'none', 'important');
                        header.style.setProperty('width', '0', 'important');
                        header.style.setProperty('padding', '0', 'important');
                        header.style.setProperty('margin', '0', 'important');
                    } else {
                        header.classList.remove('tab-group-hidden');
                        header.style.removeProperty('display');
                        header.style.removeProperty('width');
                        header.style.removeProperty('padding');
                        header.style.removeProperty('margin');
                    }
                });
            });
        });
    }

    insertStandaloneLabel(leaderEl: HTMLElement, groupId: string, groupData: TabGroupData) {
        const container = leaderEl.parentElement;
        if (!container) return;

        const labelEl = document.createElement('div');
        labelEl.className = 'tab-group-label';
        labelEl.setAttribute('data-group-id', groupId);
        
        labelEl.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            e.preventDefault();
            
            if (!groupData.isCollapsed) {
                await this.shiftFocusOut(groupId);
            }
            
            groupData.isCollapsed = !groupData.isCollapsed; // 1. 접힘 상태 반전 (열림 -> 닫힘 / 닫힘 -> 열림)
            await this.saveSettings();                      // ✨ 2. 핵심 수정: 상태가 바뀌었으니 data.json에 즉시 덮어쓰기!
            this.enforcePhysicalSorting();                  // 3. 화면 업데이트
        });
        
        // 우클릭 시 컨텍스트 메뉴(수정/삭제) 호출
        labelEl.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault(); // 기본 브라우저 우클릭 메뉴 차단
            
            // 옵시디언 내장 Menu API 사용
            const menu = new Menu();
            
            // 1. 그룹 수정 메뉴
            menu.addItem((item) => {
                item.setTitle('✏️ 그룹 수정')
                    .setIcon('pencil')
                    .onClick(() => {
                        // ✨ 잠시 후에 만들 EditGroupModal을 호출합니다.
                        new EditGroupModal(this.app, groupData.name, groupData.color, async (newName, newColor) => {
                            groupData.name = newName;
                            groupData.color = newColor;
                            await this.saveSettings();     // 변경사항 저장
                            this.enforcePhysicalSorting(); // 화면 즉시 갱신
                        }).open();
                    });
            });
            
            menu.addSeparator();
            
            // 2. 그룹 삭제 메뉴
            menu.addItem((item) => {
                item.setTitle('🗑️ 그룹 삭제')
                    .setIcon('trash')
                    .onClick(async () => {
                        // ✨ 이슈에 적어주신 대로: 내부 탭들을 먼저 일반 탭으로 안전하게 해제
                        this.app.workspace.iterateAllLeaves(leaf => {
                            if (this.leafGroupMap.get(leaf) === groupId) {
                                this.leafGroupMap.delete(leaf);
                            }
                        });
                        
                        // ✨ 그룹 데이터 완전 삭제
                        this.groups.delete(groupId);
                        
                        // ✨ 저장 및 화면 동기화
                        await this.saveSettings();
                        this.enforcePhysicalSorting();
                    });
            });
            
            menu.showAtMouseEvent(e);
        });

        labelEl.draggable = true;
        labelEl.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('application/x-tab-group-id', groupId);
            e.dataTransfer!.effectAllowed = 'move';
            
            this.draggingGroupId = groupId; // 💡 드래그 시작! 무슨 그룹인지 내장 메모리에 꽉 저장!
            document.body.classList.add('is-dragging-tab-group'); // 드래그 시작 시 body에 신호 보내기

            // 반투명 잔상(Ghost)을 라벨이 아닌 '리더 탭' 모습으로 바꿔치기
            const leaderTab = labelEl.nextElementSibling as HTMLElement;
            if (leaderTab && leaderTab.classList.contains('workspace-tab-header')) {
                e.dataTransfer!.setDragImage(leaderTab, 20, 15); 
            }

            setTimeout(() => labelEl.classList.add('is-dragging'), 0);
        });
        labelEl.addEventListener('dragend', () => {
            labelEl.classList.remove('is-dragging');
            this.draggingGroupId = null; // 💡 마우스 놓으면 까먹기 (초기화)
            this.dropIndicatorEl.style.display = 'none'; // 혹시 남을 인디케이터 찌꺼기 제거
            document.body.classList.remove('is-dragging-tab-group'); // 드래그 종료 시 body 신호 제거
        });

        labelEl.innerText = groupData.name;
        labelEl.style.backgroundColor = groupData.color;

        // 리더 탭 앞에 삽입
        container.insertBefore(labelEl, leaderEl);
    }

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
        
        // ✨ 플러그인 꺼질 때 가로채기 이벤트 확실하게 제거
        window.removeEventListener('dragenter', this.onDragEnter, { capture: true });
        window.removeEventListener('dragover', this.onDragOver, { capture: true });
        window.removeEventListener('drop', this.onDrop, { capture: true });
        
        this.globalObservers.forEach(obs => obs.disconnect());
        document.querySelectorAll('.tab-group-label').forEach(el => el.remove());
    }
}

class CreateGroupModal extends Modal {
    groupName: string = '';
    groupColor: string = '#ff5c5c'; 
    onSubmit: (groupName: string, color: string) => void;
    
    constructor(app: App, onSubmit: (groupName: string, color: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '새 탭 그룹 만들기' });
        
        new Setting(contentEl)
            .setName('그룹 이름')
            .setDesc('이름을 비워두면 색상만 있는 라벨이 만들어져요.')
            .addText((text) => text.onChange((val) => this.groupName = val));
        
        const colorSetting = new Setting(contentEl)
            .setName('그룹 색상');
        
        // 기존의 투박한 기본 피커를 날려버리고, 우리가 만든 예쁜 팔레트로 대체!
        colorSetting.controlEl.empty();
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });
        
        new Setting(contentEl)
            .addButton((btn) => btn.setButtonText('그룹 생성').setCta().onClick(() => {
                this.close();
                this.onSubmit(this.groupName, this.groupColor);
            }));
    }
    
    onClose() { 
        const { contentEl } = this;
        contentEl.empty(); 
    }
}

// ✨ 버그 픽스: 그룹 수정 시 컬러 팔레트가 정상적으로 나타나도록 구조 완전 갱신
class EditGroupModal extends Modal {
    groupName: string;
    groupColor: string; 
    onSubmit: (groupName: string, color: string) => void;
    
    // 생성할 때 기존 이름과 색상을 넘겨받습니다.
    constructor(app: App, initialName: string, initialColor: string, onSubmit: (groupName: string, color: string) => void) {
        super(app);
        this.groupName = initialName;
        this.groupColor = initialColor;
        this.onSubmit = onSubmit;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '탭 그룹 수정' });
        
        new Setting(contentEl)
            .setName('그룹 이름')
            .addText((text) => {
                text.setValue(this.groupName); // 기존 이름 불러오기
                text.onChange((val) => this.groupName = val);
            });
            
        // 👇 버그 원인 해결: DOM 요소를 비우고 새로 렌더링하는 타이밍을 안전하게 분리
        const colorSetting = new Setting(contentEl)
            .setName('그룹 색상');
        
        colorSetting.controlEl.empty(); // 옵시디언 기본 피커 제거
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });
        
        new Setting(contentEl)
            .addButton((btn) => btn.setButtonText('저장').setCta().onClick(() => {
                this.close();
                this.onSubmit(this.groupName, this.groupColor);
            }));
    }
    
    onClose() { 
        const { contentEl } = this;
        contentEl.empty(); 
    }
}

// ✨ 수정: 요청하신 9가지 색상 (물 빠진 파스텔 톤)
const PRESET_COLORS = [
    '#D0D0D0', // 그레이 (Gray)
    '#A0C4FF', // 파란색 (Blue)
    '#FFADAD', // 빨간색 (Red)
    '#FDFFB6', // 노란색 (Yellow)
    '#CAFFBF', // 초록색 (Green)
    '#FFC6FF', // 핑크색 (Pink)
    '#BDB2FF', // 보라색 (Purple)
    '#9BF6FF', // 하늘색 (Sky Blue)
    '#FFD6A5'  // 주황색 (Orange)
];

// ✨ 버그 픽스: 변수 참조(ReferenceError)가 발생하지 않도록 스코프와 구조를 재정비한 함수
function renderColorPalette(containerEl: HTMLElement, currentColor: string, onChange: (newColor: string) => void) {
    const paletteContainer = containerEl.createDiv({ cls: 'tab-group-color-palette' });
    paletteContainer.style.display = 'flex';
    paletteContainer.style.gap = '8px';
    paletteContainer.style.flexWrap = 'wrap';
    paletteContainer.style.justifyContent = 'flex-end';
    
    let activeCircle: HTMLElement | null = null;

    // function 선언문으로 변경하여 호이스팅(Hoisting) 적용 -> 어디서든 안전하게 호출 가능
    function updateActive(circle: HTMLElement) {
        if (activeCircle) activeCircle.style.border = '2px solid transparent';
        circle.style.border = '2px solid var(--text-normal)';
        activeCircle = circle;
    }

    // 1. 프리셋 컬러 버튼들 생성
    PRESET_COLORS.forEach(color => {
        const circle = paletteContainer.createDiv();
        circle.style.width = '24px';
        circle.style.height = '24px';
        circle.style.borderRadius = '50%';
        circle.style.backgroundColor = color;
        circle.style.cursor = 'pointer';
        circle.style.border = '2px solid transparent';
        circle.style.boxSizing = 'border-box';
        circle.style.transition = 'transform 0.1s ease-in-out';
        
        // 호버 시 살짝 커지는 애니메이션
        circle.addEventListener('mouseenter', () => circle.style.transform = 'scale(1.15)');
        circle.addEventListener('mouseleave', () => circle.style.transform = 'scale(1)');

        // 현재 색상과 일치하면 활성화 테두리 표시
        if (color.toLowerCase() === currentColor.toLowerCase()) {
            updateActive(circle);
        }

        circle.addEventListener('click', () => {
            updateActive(circle);
            onChange(color);
        });
    });

    // 2. 커스텀 스포이드 버튼
    const customWrapper = paletteContainer.createDiv();
    customWrapper.style.width = '24px';
    customWrapper.style.height = '24px';
    customWrapper.style.borderRadius = '50%';
    customWrapper.style.cursor = 'pointer';
    customWrapper.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'; // 무지개색 커스텀 아이콘 효과
    customWrapper.style.position = 'relative';
    customWrapper.style.border = '2px solid transparent';
    customWrapper.style.boxSizing = 'border-box';
    customWrapper.style.overflow = 'hidden';
    
    customWrapper.addEventListener('mouseenter', () => customWrapper.style.transform = 'scale(1.15)');
    customWrapper.addEventListener('mouseleave', () => customWrapper.style.transform = 'scale(1)');

    const customInput = customWrapper.createEl('input', { type: 'color' });
    
    // 안전한 색상 비교 로직
    const isPreset = PRESET_COLORS.some(c => c.toLowerCase() === currentColor.toLowerCase());
    customInput.value = isPreset ? '#ffffff' : currentColor;
    
    customInput.style.opacity = '0';
    customInput.style.width = '200%';
    customInput.style.height = '200%';
    customInput.style.position = 'absolute';
    customInput.style.top = '-50%';
    customInput.style.left = '-50%';
    customInput.style.cursor = 'pointer';

    // 프리셋에 없는 색상이면 커스텀 피커 쪽에 활성화 테두리 표시
    if (!isPreset) {
        updateActive(customWrapper);
    }

    customInput.addEventListener('input', (e) => {
        const newColor = (e.target as HTMLInputElement).value;
        updateActive(customWrapper);
        onChange(newColor);
    });
}