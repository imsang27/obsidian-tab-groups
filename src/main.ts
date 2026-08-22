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
    
    // ✨ 핵심: 브라우저가 화면을 그리기 전에 조작을 끝내버리는 초고속 감시자
    globalObservers: Map<Element, MutationObserver> = new Map();
    
    async onload() {
        console.log('🚀 Tab Groups 로드됨 (무조건 재생성 + 마이크로태스크 감시자 도입)');

        this.app.workspace.onLayoutReady(() => {
            this.setupObservers();
            this.enforcePhysicalSorting();
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

        // 🎯 그룹 통째로 드래그 앤 드롭 이동 (빈 공간 드롭 허용 및 안전성 강화)
        this.registerDomEvent(document, 'drop', (e: DragEvent) => {
            const draggedGroupId = e.dataTransfer?.getData('application/x-tab-group-id');
            if (!draggedGroupId) return;

            e.preventDefault();
            e.stopPropagation();

            const target = e.target as HTMLElement;
            const container = target.closest('.workspace-tab-header-container-inner');
            
            // 탭 바 밖으로 던지면 무시
            if (!container) return;

            const dropHeader = target.closest('.workspace-tab-header') as HTMLElement;
            const dropLabel = target.closest('.tab-group-label') as HTMLElement;

            let insertBeforeNode: Node | null = null;
            if (dropHeader) {
                insertBeforeNode = dropHeader;
            } else if (dropLabel) {
                insertBeforeNode = dropLabel;
            }

            // 타겟이 자기 자신 그룹 내부면 무시
            if (insertBeforeNode) {
                const targetGroupId = (insertBeforeNode as HTMLElement).getAttribute('data-group-id') || (insertBeforeNode as HTMLElement).getAttribute('data-tab-group-id');
                if (targetGroupId === draggedGroupId) return;
            }

            const allHeaders = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const draggedHeaders = allHeaders.filter(h => h.getAttribute('data-tab-group-id') === draggedGroupId);

            if (draggedHeaders.length > 0) {
                // 💡 DocumentFragment를 사용해 탭들을 한 덩어리로 안전하게 포장해서 옮깁니다.
                const fragment = document.createDocumentFragment();
                draggedHeaders.forEach(header => fragment.appendChild(header));
                
                // insertBeforeNode가 null이면(빈 공간에 떨구면) 자동으로 맨 끝에 붙습니다!
                container.insertBefore(fragment, insertBeforeNode);
                
                this.enforcePhysicalSorting();
            }
        });

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
                                .onClick(() => {
                                    this.leafGroupMap.delete(targetLeaf);
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
                                        .onClick(() => {
                                            this.leafGroupMap.set(targetLeaf, groupId);
                                            groupData.isCollapsed = false; 
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
                            .onClick(() => {
                                new CreateGroupModal(this.app, (groupName, color) => {
                                    const groupId = 'group-' + Date.now();
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false });
                                    
                                    this.leafGroupMap.set(targetLeaf, groupId);
                                    this.enforcePhysicalSorting();
                                }).open();
                            });
                    });
                }
            })
        );
    }

    // ✨ 화면을 모니터링하다가 훼손되면 즉각 0ms 만에 복구
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

            groupData.isCollapsed = !groupData.isCollapsed;
            this.enforcePhysicalSorting(); 
        });

        labelEl.draggable = true;
        labelEl.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('application/x-tab-group-id', groupId);
            e.dataTransfer!.effectAllowed = 'move';
            
            // 반투명 잔상(Ghost)을 라벨이 아닌 '리더 탭' 모습으로 바꿔치기
            const leaderTab = labelEl.nextElementSibling as HTMLElement;
            if (leaderTab && leaderTab.classList.contains('workspace-tab-header')) {
                e.dataTransfer!.setDragImage(leaderTab, 20, 15);
            }

            setTimeout(() => labelEl.classList.add('is-dragging'), 0);
        });
        labelEl.addEventListener('dragend', () => {
            labelEl.classList.remove('is-dragging');
        });

        labelEl.innerText = groupData.name;
        labelEl.style.backgroundColor = groupData.color;

        // 리더 탭 앞에 삽입
        container.insertBefore(labelEl, leaderEl);
    }

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
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