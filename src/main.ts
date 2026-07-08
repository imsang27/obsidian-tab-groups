import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean; 
}

export default class TabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    // ✨ 궁극의 무기: 옵시디언이 DOM을 지워도 절대 날아가지 않는 Leaf 전용 객체 메모리!
    leafGroupMap: WeakMap<WorkspaceLeaf, string> = new WeakMap(); 

    lastClickedLeaf: WorkspaceLeaf | null = null; 
    previousActiveLeaf: WorkspaceLeaf | null = null;
    renderTimeout: NodeJS.Timeout | null = null;
    
    async onload() {
        console.log('🚀 Tab Groups 로드됨 (WeakMap 메모리 및 JS 강제 숨김 방어 적용)');

        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const header = target.closest('.workspace-tab-header') as HTMLElement | null;
            // 우클릭하는 순간, 변하기 쉬운 DOM 요소 대신 영구적인 Leaf 객체를 즉시 포획합니다.
            if (header) {
                this.lastClickedLeaf = this.findLeafFromHeader(header);
            } else {
                this.lastClickedLeaf = null;
            }
        }, { capture: true });

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.enforcePhysicalSorting();
            })
        );

        this.registerDomEvent(document, 'dragend', () => {
            setTimeout(() => this.enforcePhysicalSorting(), 50);
        });

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (!leaf) return;
                
                const headerEl = (leaf as any).tabHeaderEl as HTMLElement;
                if (headerEl && headerEl.classList.contains('tab-group-hidden')) {
                    this.skipHiddenTab(leaf);
                } else {
                    this.previousActiveLeaf = leaf;
                }

                this.triggerRender(); 
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {

                if (source === 'tab-header' && this.lastClickedLeaf) {
                    const targetLeaf = this.lastClickedLeaf; 
                    // 메모리에서 해당 탭의 소속 그룹을 확인
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

    triggerRender() {
        if (this.renderTimeout) clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(() => {
            this.enforcePhysicalSorting();
        }, 50);
    }

    // ✨ 그룹을 접기 전에, 포커스가 안에 있다면 밖으로 안전하게 대피시킵니다 (오류 방지)
    async shiftFocusOut(groupId: string) {
        let activeHeader = document.querySelector('.workspace-tab-header.is-active') as HTMLElement;
        if (activeHeader && activeHeader.getAttribute('data-tab-group-id') === groupId) {
            const allHeaders = Array.from(document.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            // 다른 탭을 찾아서 포커스 이동
            const targetHeader = allHeaders.find(h => h.getAttribute('data-tab-group-id') !== groupId && !h.classList.contains('tab-group-hidden'));
            
            if (targetHeader) {
                const targetLeaf = this.findLeafFromHeader(targetHeader);
                if (targetLeaf) {
                    await this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                    await new Promise(resolve => setTimeout(resolve, 50)); // 이동이 완료될 때까지 잠시 대기
                }
            }
        }
    }

    skipHiddenTab(currentLeaf: WorkspaceLeaf) {
        const currentHeader = (currentLeaf as any).tabHeaderEl as HTMLElement;
        if (!currentHeader) return;
        
        const container = currentHeader.parentElement;
        if (!container) return;
        
        const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
        const currentIndex = headers.indexOf(currentHeader);
        if (currentIndex === -1) return;

        let direction = 1; 
        
        if (this.previousActiveLeaf) {
            const prevHeader = (this.previousActiveLeaf as any).tabHeaderEl as HTMLElement;
            const prevIndex = headers.indexOf(prevHeader);
            if (prevIndex !== -1) {
                if (currentIndex === prevIndex - 1 || (prevIndex === 0 && currentIndex === headers.length - 1)) {
                    direction = -1; 
                }
            }
        }

        let nextIndex = currentIndex + direction;
        let targetLeaf: WorkspaceLeaf | null = null;
        let count = 0;

        while (count < headers.length) {
            if (nextIndex >= headers.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = headers.length - 1;

            const candidate = headers[nextIndex];
            
            if (candidate && !candidate.classList.contains('tab-group-hidden')) {
                targetLeaf = this.findLeafFromHeader(candidate);
                break;
            }
            
            nextIndex += direction;
            count++;
        }

        if (targetLeaf && targetLeaf !== currentLeaf) {
            setTimeout(() => {
                this.app.workspace.setActiveLeaf(targetLeaf!, { focus: true });
            }, 10);
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

    // ✨ 핵심 복구 로직: 옵시디언이 속성을 지워도 메모리를 바탕으로 즉시 수복합니다.
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
                    // 그룹에 속하지 않은 탭은 깨끗하게 유지
                    header.removeAttribute('data-tab-group-id');
                    header.style.borderTop = '';
                    header.style.backgroundColor = '';
                }
            }
        });
    }

    enforcePhysicalSorting() {
        // 1. DOM 조작 전 탭들의 소속을 영구 메모리에서 완벽히 복원
        this.restoreDomAttributes();

        const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');

        tabContainers.forEach(container => {
            container.querySelectorAll('.tab-group-label').forEach(el => el.remove());

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
                            if (newActiveIndex !== -1) {
                                parentGroup.currentTab = newActiveIndex;
                            }
                        }
                    }
                }
            }
        });

        this.renderGroupUI();
    }

    renderGroupUI() {
        const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');

        tabContainers.forEach(container => {
            container.querySelectorAll('.tab-group-label').forEach(el => el.remove());

            const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const groupMap = new Map<string, HTMLElement[]>();

            headers.forEach(header => {
                const groupId = header.getAttribute('data-tab-group-id');
                if (groupId) {
                    if (!groupMap.has(groupId)) groupMap.set(groupId, []);
                    groupMap.get(groupId)!.push(header);
                } else {
                    // 일반 탭 숨김 및 스타일 초기화
                    header.classList.remove('tab-group-hidden');
                    header.style.removeProperty('display');
                    header.style.removeProperty('width');
                    header.style.removeProperty('padding');
                    header.style.removeProperty('margin');
                    header.style.removeProperty('flex');
                    header.style.removeProperty('overflow');
                }
            });

            groupMap.forEach((groupHeaders, groupId) => {
                const groupData = this.groups.get(groupId);
                if (!groupData) return;

                const leader = groupHeaders[0];
                this.insertStandaloneLabel(leader, groupId, groupData);

                groupHeaders.forEach(header => {
                    if (groupData.isCollapsed) {
                        header.classList.add('tab-group-hidden');
                        // ✨ CSS의 방해를 무시하는 가장 강력한 JS 인라인 숨김 처리
                        header.style.setProperty('display', 'none', 'important');
                        header.style.setProperty('width', '0', 'important');
                        header.style.setProperty('padding', '0', 'important');
                        header.style.setProperty('margin', '0', 'important');
                        header.style.setProperty('flex', '0 0 0', 'important');
                        header.style.setProperty('overflow', 'hidden', 'important');
                    } else {
                        header.classList.remove('tab-group-hidden');
                        // 폈을 땐 다시 원상 복구
                        header.style.removeProperty('display');
                        header.style.removeProperty('width');
                        header.style.removeProperty('padding');
                        header.style.removeProperty('margin');
                        header.style.removeProperty('flex');
                        header.style.removeProperty('overflow');
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
        
        labelEl.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            e.preventDefault();
            
            // 그룹이 열려 있는데 닫으려고 하는 경우, 안에 포커스가 있다면 미리 빼냅니다.
            if (!groupData.isCollapsed) {
                await this.shiftFocusOut(groupId);
            }

            groupData.isCollapsed = !groupData.isCollapsed;
            this.enforcePhysicalSorting(); 
        });

        labelEl.innerText = groupData.name;
        labelEl.style.backgroundColor = groupData.color;

        container.insertBefore(labelEl, leaderEl);
    }

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
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