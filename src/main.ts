import { Plugin, Modal, App, Setting, Menu, TAbstractFile } from 'obsidian';

// 1. 메모리에 저장할 그룹 데이터 구조
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
}

export default class ChromeTabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    lastClickedTabHeader: HTMLElement | null = null;
    
    async onload() {
        console.log('🚀 Tab Groups 플러그인 로드됨 (기존 그룹 할당 기능 추가)');

        this.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            this.lastClickedTabHeader = target.closest('.workspace-tab-header') as HTMLElement | null;
        }, { capture: true });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {
                
                if (source === 'tab-header' && this.lastClickedTabHeader) {
                    const headerEl = this.lastClickedTabHeader; 
                    const currentGroupId = headerEl.getAttribute('data-tab-group-id');

                    menu.addSeparator();

                    // 기능 1: 현재 탭이 이미 어떤 그룹에 속해 있다면 '그룹에서 제외' 버튼 띄우기
                    if (currentGroupId) {
                        menu.addItem((item) => {
                            item.setTitle('❌ 그룹에서 제외')
                                .onClick(() => {
                                    headerEl.removeAttribute('data-tab-group-id');
                                    headerEl.style.borderTop = '';
                                    headerEl.style.backgroundColor = '';
                                    console.log('✅ 탭이 그룹에서 제외되었습니다.');
                                });
                        });
                        menu.addSeparator();
                    }

                    // 기능 2: 이미 만들어진 그룹들이 있다면, 하나씩 클릭할 수 있게 메뉴에 나열하기
                    if (this.groups.size > 0) {
                        this.groups.forEach((groupData, groupId) => {
                            // 이미 현재 탭이 속해있는 그룹은 메뉴에서 안 보이게 숨김 (깔끔한 UX)
                            if (groupId !== currentGroupId) {
                                menu.addItem((item) => {
                                    item.setTitle(`🎨 [${groupData.name}] 그룹에 넣기`)
                                        .onClick(() => {
                                            // 기존 그룹의 색상을 탭에 입혀줍니다
                                            headerEl.setAttribute('data-tab-group-id', groupId);
                                            headerEl.style.borderTop = `3px solid ${groupData.color}`;
                                            headerEl.style.backgroundColor = `${groupData.color}1A`;
                                            console.log(`✅ [${groupData.name}] 그룹에 탭 추가 완료!`);
                                        });
                                });
                            }
                        });
                        menu.addSeparator();
                    }

                    // 기능 3: 완전히 새로운 그룹 만들기 (기존과 동일)
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
                                    
                                    console.log(`✅ 새 그룹 생성 완료: [${groupName}]`);
                                }).open();
                            });
                    });
                }
            })
        );
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