import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

// 메모리에 저장할 그룹 데이터 구조
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
}

export default class ChromeTabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    lastClickedTabHeader: HTMLElement | null = null;
    
    async onload() {
        console.log('🚀 Tab Groups 로드됨 (단축키 이동 버그 완벽 수정본)');

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
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set() });
                                    
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
                        
                        // ✨ [버그 수정] 현재 포커스된(활성화된) 탭을 찾습니다.
                        const activeHeader = sortedHeaders.find(h => h.classList.contains('is-active'));
                        const activeLeaf = activeHeader ? this.findLeafFromHeader(activeHeader) : null;

                        // 배열 덮어쓰기
                        parentGroup.children = sortedLeaves;

                        // ✨ [버그 수정] 단축키 꼬임 방지: 활성화된 탭의 새 인덱스(번호표)를 시스템에 알려줍니다!
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
    }

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
    }
}

// ==========================================
// 팝업창(Modal) UI 클래스
// ==========================================
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