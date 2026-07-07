import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

// 메모리에 저장할 그룹 데이터 구조
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean; 
}

export default class TabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    lastClickedTabHeader: HTMLElement | null = null;
    previousActiveLeaf: WorkspaceLeaf | null = null;
    
    async onload() {
        console.log('🚀 Tab Groups 로드됨 (대표 탭 스킵 및 겹침 버그 완벽 수정)');

        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            this.lastClickedTabHeader = target.closest('.workspace-tab-header') as HTMLElement | null;
        }, { capture: true });

		// 탭 레이아웃 변경 시 정렬
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.enforcePhysicalSorting();
            })
        );

        // 드래그 종료 시 정렬
        this.registerDomEvent(document, 'dragend', () => {
            setTimeout(() => this.enforcePhysicalSorting(), 50);
        });

		// 우클릭 메뉴 등록
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                if (!leaf) return;
                
                const headerEl = (leaf as any).tabHeaderEl as HTMLElement;
                // ✨ 핵심: 숨겨진 탭뿐만 아니라, 접혀있는 그룹의 '대표 탭(라벨)'도 건너뛰도록 조건 추가
                if (headerEl && (headerEl.classList.contains('tab-group-hidden') || headerEl.classList.contains('tab-group-collapsed-leader'))) {
                    this.skipHiddenTab(leaf);
                } else {
                    this.previousActiveLeaf = leaf;
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {

				if (source === 'tab-header' && this.lastClickedTabHeader) {
                    const headerEl = this.lastClickedTabHeader; 
                    const currentGroupId = headerEl.getAttribute('data-tab-group-id');

                    menu.addSeparator();

                    if (currentGroupId) {
                        menu.addItem((item) => {
                            item.setTitle('❌ 그룹에서 제외')
                                .onClick(() => {
                                    headerEl.removeAttribute('data-tab-group-id');
                                    headerEl.style.borderTop = '';
                                    headerEl.style.backgroundColor = '';
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
                                            headerEl.setAttribute('data-tab-group-id', groupId);
                                            headerEl.style.borderTop = `3px solid ${groupData.color}`;
                                            headerEl.style.backgroundColor = `${groupData.color}1A`;
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
                                    
                                    headerEl.setAttribute('data-tab-group-id', groupId);
                                    headerEl.style.borderTop = `3px solid ${color}`;
                                    headerEl.style.backgroundColor = `${color}1A`;
                                    
                                    this.enforcePhysicalSorting();
                                }).open();
                            });
                    });
                }
            })
        );
    }

    skipHiddenTab(currentLeaf: WorkspaceLeaf) {
        const currentHeader = (currentLeaf as any).tabHeaderEl as HTMLElement;
        if (!currentHeader) return;
        
        const container = currentHeader.parentElement;
        if (!container) return;
        
        const headers = Array.from(container.children) as HTMLElement[];
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
            
            // ✨ 이동할 타겟은 '완전히 숨겨진 탭'도 아니고 '접힌 그룹의 대표 탭'도 아닌 진짜 일반 탭이어야 함
            const isHidden = candidate.classList.contains('tab-group-hidden');
            const isCollapsedLeader = candidate.classList.contains('tab-group-collapsed-leader');

            if (candidate && !isHidden && !isCollapsedLeader) {
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

    enforcePhysicalSorting() {
        const tabContainers = document.querySelectorAll('.workspace-tab-header-container-inner');

        tabContainers.forEach(container => {
            const headers = Array.from(container.children) as HTMLElement[];
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

			// 1. 물리적 DOM 재조립
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

            // 2. 내부 데이터 동기화
            const sortedLeaves = sortedHeaders.map(h => this.findLeafFromHeader(h)).filter(l => l !== null);
            if (sortedLeaves.length > 0) {
                const parentGroup = (sortedLeaves[0] as any).parent;
                
                if (parentGroup && Array.isArray(parentGroup.children)) {
                    if (parentGroup.children.length === sortedLeaves.length) {
                        
                        // 🐛 [버그 수정] 현재 포커스된(활성화된) 탭을 찾음.
                        const activeHeader = sortedHeaders.find(h => h.classList.contains('is-active'));
                        const activeLeaf = activeHeader ? this.findLeafFromHeader(activeHeader) : null;

                        // 배열 덮어쓰기
                        parentGroup.children = sortedLeaves;

                        // 🐛 [버그 수정] 단축키 꼬임 방지: 활성화된 탭의 새 인덱스(번호표)를 시스템에 알려줌!
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
            const headers = Array.from(container.querySelectorAll('.workspace-tab-header')) as HTMLElement[];
            const groupMap = new Map<string, HTMLElement[]>();

            headers.forEach(header => {
                const groupId = header.getAttribute('data-tab-group-id');
                if (groupId) {
                    if (!groupMap.has(groupId)) groupMap.set(groupId, []);
                    groupMap.get(groupId)!.push(header);
                } else {
                    this.cleanupTab(header);
                }
            });

            groupMap.forEach((groupHeaders, groupId) => {
                const groupData = this.groups.get(groupId);
                if (!groupData) return;

                groupHeaders.forEach((header, index) => {
                    const isLeader = index === 0;

                    if (isLeader) {
                        header.classList.remove('tab-group-hidden');
                        this.ensureGroupLabel(header, groupId, groupData);
                        
                        if (groupData.isCollapsed) {
                            header.classList.add('tab-group-collapsed-leader');
                        } else {
                            header.classList.remove('tab-group-collapsed-leader');
                        }
                    } else {
                        this.removeGroupLabel(header);
                        header.classList.remove('tab-group-collapsed-leader');
                        
                        if (groupData.isCollapsed) {
                            header.classList.add('tab-group-hidden');
                        } else {
                            header.classList.remove('tab-group-hidden');
                        }
                    }
                });
            });
        });
    }

    ensureGroupLabel(headerEl: HTMLElement, groupId: string, groupData: TabGroupData) {
        let labelEl = headerEl.querySelector('.tab-group-label') as HTMLElement;
        
        if (!labelEl) {
            labelEl = document.createElement('div');
            labelEl.className = 'tab-group-label';
            
            labelEl.addEventListener('click', (e) => {
                e.stopPropagation(); 
                e.preventDefault();
                
                groupData.isCollapsed = !groupData.isCollapsed;
                this.enforcePhysicalSorting(); 
            });

            headerEl.prepend(labelEl);
        }

        labelEl.innerText = groupData.name;
        labelEl.style.backgroundColor = groupData.color;
    }

    removeGroupLabel(headerEl: HTMLElement) {
        const labelEl = headerEl.querySelector('.tab-group-label');
        if (labelEl) labelEl.remove();
    }

    cleanupTab(headerEl: HTMLElement) {
        this.removeGroupLabel(headerEl);
        headerEl.classList.remove('tab-group-hidden');
        headerEl.classList.remove('tab-group-collapsed-leader');
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