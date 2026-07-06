import { Plugin, Modal, App, Setting, Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';

// 메모리에 저장할 그룹 데이터 구조
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
}

export default class ChromeTabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    
    async onload() {
        console.log('🚀 Tab Groups 플러그인 로드됨 (네이티브 우클릭 메뉴 연동)');

        // 옵시디언의 기본 우클릭 메뉴(file-menu)가 열릴 때 발생하는 이벤트를 가로챕니다.
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
                
                // 메뉴가 열린 곳이 '탭 헤더(tab-header)'일 때만 우리 메뉴를 추가합니다.
                if (source === 'tab-header' && leaf) {
                    
                    // 1. 기존 옵시디언 메뉴들과 섞이지 않게 구분선(Separator)을 하나 그어줍니다.
                    menu.addSeparator();

                    // 2. 맨 밑에 '새 그룹에 추가' 메뉴를 쏙 끼워 넣습니다.
                    menu.addItem((item) => {
                        item
                            .setTitle('✨ 새 탭 그룹 만들기')
                            .setIcon('folder-plus') // 예쁜 폴더 아이콘
                            .onClick(() => {
                                // 사용자가 클릭하면 팝업창을 띄웁니다.
                                new CreateGroupModal(this.app, (groupName, color) => {
                                    const groupId = 'group-' + Date.now();
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set() });
                                    
                                    // leaf 객체에 숨겨진 tabHeaderEl(탭 UI 요소)를 가져와서 색상을 칠합니다.
                                    const headerEl = (leaf as any).tabHeaderEl as HTMLElement;
                                    if (headerEl) {
                                        headerEl.setAttribute('data-tab-group-id', groupId);
                                        headerEl.style.borderTop = `3px solid ${color}`;
                                        headerEl.style.backgroundColor = `${color}1A`;
                                    }
                                    
                                    console.log(`✅ 그룹 생성 완료: [${groupName}] 색상: ${color}`);
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
            .setName('그룹 이름 (Label)')
            .setDesc('크롬 탭처럼 맨 앞에 표시될 이름을 적어주세요.')
            .addText((text) =>
                text.onChange((value) => {
                    this.groupName = value;
                })
            );

        new Setting(contentEl)
            .setName('상징 색상 (Color)')
            .addColorPicker((color) => 
                color.setValue(this.groupColor).onChange((value) => {
                    this.groupColor = value;
                })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('그룹 생성')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.groupName, this.groupColor);
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}