import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean; 
}

export default class TabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    leafGroupMap: WeakMap<WorkspaceLeaf, string> = new WeakMap(); 

    lastClickedLeaf: WorkspaceLeaf | null = null; 
    previousActiveLeaf: WorkspaceLeaf | null = null;
    
    globalObserver: MutationObserver | null = null;
    
    async onload() {
        console.log('🚀 Tab Groups 로드됨 (완전 동기식 렌더링, 증발 및 깜빡임 100% 해결)');

        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const header = target.closest('.workspace-tab-header') as HTMLElement | null;
            if (header) {
                this.lastClickedLeaf = this.findLeafFromHeader(header);
            } else {
                this.lastClickedLeaf = null;
            }
        }, { capture: true });

        // 레이아웃이 바뀔 때 완벽 동기화 실행
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.runFullSync();
            })
        );

        // 🎯 1. 드래그 앤 드롭 통째로 이동 기능
        this.registerDomEvent(document, 'dragover', (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('application/x-tab-group-id')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        });

        this.registerDomEvent(document, 'drop', (e: DragEvent) => {
            const draggedGroupId = e.dataTransfer?.getData('application/x-tab-group-id');
            if (!draggedGroupId) return;

            e.preventDefault();
            e.stopPropagation();

            const target = e.target as HTMLElement;
            const dropHeader = target.closest('.workspace-tab-header') as HTMLElement;
            const dropLabel = target.closest('.tab-group-label') as HTMLElement;

            let targetLeaf: WorkspaceLeaf | null = null;
            if (dropHeader) {
                targetLeaf = this.findLeafFromHeader(dropHeader);
            } else if (dropLabel) {
                const dropGroupId = dropLabel.getAttribute('data-group-id');
                if (dropGroupId === draggedGroupId) return; 
                this.app.workspace.iterateAllLeaves(leaf => {
                    if (this.leafGroupMap.get(leaf) === dropGroupId && !targetLeaf) {
                        targetLeaf = leaf;
                    }
                });
            }

            if (!targetLeaf) return;

            const parentNode = (targetLeaf as any).parent;
            if (!parentNode || !Array.isArray(parentNode.children)) return;

            const currentChildren = parentNode.children as WorkspaceLeaf[];
            const draggedLeaves = currentChildren.filter(l => this.leafGroupMap.get(l) === draggedGroupId);
            if (draggedLeaves.length === 0) return;

            const newChildren = currentChildren.filter(l => this.leafGroupMap.get(l) !== draggedGroupId);
            let insertIndex = newChildren.indexOf(targetLeaf);
            
            if (insertIndex !== -1) {
                newChildren.splice(insertIndex, 0, ...draggedLeaves);
                parentNode.children = newChildren;
                this.runFullSync();
            }
        });

        // 🎯 2. 스마트 펼침 및 단축키 스킵
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (!leaf) return;
                
                const groupId = this.leafGroupMap.get(leaf);
                let skipTriggered = false;

                if (groupId) {
                    const groupData = this.groups.get(groupId);
                    if (groupData && groupData.isCollapsed) {
                        const parent = (leaf as any).parent;
                        if (parent && Array.isArray(parent.children)) {
                            const children = parent.children as WorkspaceLeaf[];
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

                            if (isSequential) {
                                // 단축키: 즉시 탭 숨김 처리하여 깜빡임 방지 후 점프
                                const headerEl = (leaf as any).tabHeaderEl as HTMLElement;
                                if (headerEl) {
                                    headerEl.classList.add('tab-group-hidden');
                                    headerEl.style.setProperty('display', 'none', 'important');
                                }
                                this.skipHiddenTab(leaf, direction);
                                skipTriggered = true;
                            } else {
                                // 직접 클릭: 스마트 펼침
                                groupData.isCollapsed = false;
                            }
                        }
                    }
                }
                
                this.previousActiveLeaf = leaf;
                if (!skipTriggered) {
                    this.runFullSync();
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
                                .onClick(() => {
                                    this.leafGroupMap.delete(targetLeaf);
                                    this.runFullSync();
                                });
                        });
                        menu.addSeparator();
                    }

                    if (this.groups.size > 0) {
                        this.groups.forEach((groupData, groupId) => {
                            if (groupId !== currentGroupId) {
                                menu.addItem((item) => {
                                    item.setTitle(`🎨 [${groupData.name}] 그룹에 넣기`)
                                        .onClick(() => {
                                            this.leafGroupMap.set(targetLeaf, groupId);
                                            groupData.isCollapsed = false; 
                                            this.runFullSync();
                                        });
                                });
                            }
                        });
                        menu.addSeparator();
                    }

                    menu.addItem((item) => {
                        item.setTitle('✨ 새 탭 그룹 만들기')
                            .setIcon('folder-plus')
                            .onClick(() => {
                                new CreateGroupModal(this.app, (groupName, color) => {
                                    const groupId = 'group-' + Date.now();
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false });
                                    
                                    this.leafGroupMap.set(targetLeaf, groupId);
                                    this.runFullSync();
                                }).open();
                            });
                    });
                }
            })
        );

        // 플러그인이 켜질 때 초기 렌더링
        setTimeout(() => {
            this.runFullSync();
        }, 100);
    }

    // ✨ 전체 동기화 사이클: 데이터 정렬 -> 옵시디언 감시 -> UI 그리기
    runFullSync() {
        this.syncInternalState();
        
        // UI를 그리는 동안에는 옵저버를 잠깐 끕니다 (무한루프 방지)
        if (this.globalObserver) this.globalObserver.disconnect();
        this.renderLabels();
        this.attachObservers();
    }

    // ✨ 타이머 없는 동기식 감시자 (옵시디언이 몰래 지우면 0ms 만에 복구)
    attachObservers() {
        if (this.globalObserver) this.globalObserver.disconnect();
        
        this.globalObserver = new MutationObserver(() => {
            this.globalObserver!.disconnect(); // 렌더링 중 재호출 방지
            try {
                this.renderLabels(); // 라벨만 빠르게 복구
            } catch (e) {
                console.error("Tab Groups UI Render Error:", e);
            } finally {
                // 복구 후 다시 감시 시작
                document.querySelectorAll('.workspace-tab-header-container-inner').forEach(c => {
                    this.globalObserver!.observe(c, { childList: true });
                });
            }
        });

        document.querySelectorAll('.workspace-tab-header-container-inner').forEach(c => {
            this.globalObserver!.observe(c, { childList: true });
        });
    }

    // ✨ 내부 탭 배열 논리적 정렬 (DOM 조작 안 함!)
    syncInternalState() {
        const parents = new Set<any>();
        this.app.workspace.iterateAllLeaves(leaf => {
            if ((leaf as any).parent) parents.add((leaf as any).parent);
        });

        parents.forEach(parent => {
            if (!parent.children || !Array.isArray(parent.children)) return;
            const leaves = parent.children as WorkspaceLeaf[];
            if (leaves.length === 0) return;

            const groupBlocks = new Map<string, WorkspaceLeaf[]>();
            leaves.forEach(l => {
                const gid = this.leafGroupMap.get(l);
                if (gid) {
                    if (!groupBlocks.has(gid)) groupBlocks.set(gid, []);
                    groupBlocks.get(gid)!.push(l);
                }
            });

            const finalLeaves: WorkspaceLeaf[] = [];
            const seenGroups = new Set<string>();

            leaves.forEach(l => {
                const gid = this.leafGroupMap.get(l);
                if (gid) {
                    if (!seenGroups.has(gid)) {
                        seenGroups.add(gid);
                        finalLeaves.push(...groupBlocks.get(gid)!);
                    }
                } else {
                    finalLeaves.push(l);
                }
            });

            let orderChanged = false;
            if (leaves.length === finalLeaves.length) {
                for (let i = 0; i < leaves.length; i++) {
                    if (leaves[i] !== finalLeaves[i]) {
                        orderChanged = true; break;
                    }
                }
            }

            // 진짜로 순서가 꼬였을 때만 옵시디언에 업데이트 지시
            if (orderChanged) {
                parent.children = finalLeaves;
                
                const activeHeader = document.querySelector('.workspace-tab-header.is-active');
                if (activeHeader) {
                    let activeLeaf: WorkspaceLeaf | null = null;
                    this.app.workspace.iterateAllLeaves(l => {
                        if ((l as any).tabHeaderEl === activeHeader) activeLeaf = l;
                    });
                    if (activeLeaf) {
                        const idx = finalLeaves.indexOf(activeLeaf);
                        if (idx !== -1) parent.currentTab = idx;
                    }
                }
            }
        });
    }

    // ✨ DOM 업데이트와 라벨 재활용 (가장 안전하고 빠른 렌더링)
    renderLabels() {
        // 1. DOM 요소들에 속성 복구
        this.app.workspace.iterateAllLeaves(leaf => {
            const header = (leaf as any).tabHeaderEl as HTMLElement;
            if (header) {
                const gid = this.leafGroupMap.get(leaf);
                if (gid) {
                    header.setAttribute('data-tab-group-id', gid);
                } else {
                    header.removeAttribute('data-tab-group-id');
                }
            }
        });

        // 2. 컨테이너별로 라벨 정리
        const containers = document.querySelectorAll('.workspace-tab-header-container-inner');
        containers.forEach(container => {
            const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const groupMap = new Map<string, HTMLElement[]>();

            headers.forEach(h => {
                const gid = h.getAttribute('data-tab-group-id');
                if (gid) {
                    if (!groupMap.has(gid)) groupMap.set(gid, []);
                    groupMap.get(gid)!.push(h);
                }
            });

            const validGroups = new Set<string>();

            groupMap.forEach((gHeaders, gid) => {
                const gData = this.groups.get(gid);
                if (!gData) return;
                validGroups.add(gid);

                const leader = gHeaders[0];
                let labelEl = container.querySelector(`.tab-group-label[data-group-id="${gid}"]`) as HTMLElement;
                
                // 생성 또는 재활용 (지우고 다시 그리는 깜빡임 완전 제거)
                if (!labelEl) {
                    labelEl = this.createLabel(gid, gData);
                } else {
                    labelEl.innerText = gData.name;
                    labelEl.style.backgroundColor = gData.color;
                }

                // 위치가 어긋났을 때만 이동 (React 충돌 최소화)
                if (leader.previousSibling !== labelEl) {
                    container.insertBefore(labelEl, leader);
                }

                // 탭 숨김 처리 (절대 무력화되지 않는 인라인 스타일)
                gHeaders.forEach(h => {
                    if (gData.isCollapsed) {
                        h.classList.add('tab-group-hidden');
                        h.style.setProperty('display', 'none', 'important');
                        h.style.setProperty('width', '0', 'important');
                        h.style.setProperty('padding', '0', 'important');
                        h.style.setProperty('margin', '0', 'important');
                    } else {
                        h.classList.remove('tab-group-hidden');
                        h.style.removeProperty('display');
                        h.style.removeProperty('width');
                        h.style.removeProperty('padding');
                        h.style.removeProperty('margin');
                    }
                    h.style.borderTop = `3px solid ${gData.color}`;
                    h.style.backgroundColor = `${gData.color}1A`;
                });
            });

            // 3. 버려진 라벨들 청소
            container.querySelectorAll('.tab-group-label').forEach(label => {
                const gid = label.getAttribute('data-group-id');
                if (!gid || !validGroups.has(gid)) label.remove();
            });
            
            // 4. 단일 탭 속성 초기화
            headers.forEach(h => {
                if (!h.getAttribute('data-tab-group-id')) {
                    h.classList.remove('tab-group-hidden');
                    h.style.removeProperty('display');
                    h.style.removeProperty('width');
                    h.style.removeProperty('padding');
                    h.style.removeProperty('margin');
                    h.style.borderTop = '';
                    h.style.backgroundColor = '';
                }
            });
        });
    }

    createLabel(groupId: string, groupData: TabGroupData): HTMLElement {
        const labelEl = document.createElement('div');
        labelEl.className = 'tab-group-label';
        labelEl.setAttribute('data-group-id', groupId);
        
        labelEl.addEventListener('click', async (e) => {
            e.stopPropagation(); e.preventDefault();
            
            if (!groupData.isCollapsed) {
                await this.shiftFocusOut(groupId);
            }
            groupData.isCollapsed = !groupData.isCollapsed;
            this.runFullSync();
        });

        labelEl.draggable = true;
        labelEl.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('application/x-tab-group-id', groupId);
            e.dataTransfer!.effectAllowed = 'move';
            setTimeout(() => labelEl.classList.add('is-dragging'), 0);
        });
        labelEl.addEventListener('dragend', () => {
            labelEl.classList.remove('is-dragging');
        });

        return labelEl;
    }

    async shiftFocusOut(groupId: string) {
        let targetLeaf: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves(leaf => {
            const leafGroup = this.leafGroupMap.get(leaf);
            if (!targetLeaf && leafGroup !== groupId) {
                const gData = leafGroup ? this.groups.get(leafGroup) : null;
                if (!gData || !gData.isCollapsed) {
                    targetLeaf = leaf;
                }
            }
        });

        if (targetLeaf) {
            await this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
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

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
        if (this.globalObserver) this.globalObserver.disconnect();
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

        new Setting(contentEl)
            .setName('그룹 색상')
            .addColorPicker((color) => color.setValue(this.groupColor).onChange((val) => this.groupColor = val));

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