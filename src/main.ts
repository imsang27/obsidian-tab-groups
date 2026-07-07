import { Plugin, Modal, App, Setting, Menu, TAbstractFile } from 'obsidian';

// 1. 메모리에 저장할 그룹 데이터 구조 (orderIndex 추가 ✨)
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    orderIndex: number; // 그룹별 자동 정렬을 위한 순서 번호
}

export default class ChromeTabGroupsPlugin extends Plugin {
    groups: Map<string, TabGroupData> = new Map();
    lastClickedTabHeader: HTMLElement | null = null;
    groupCounter: number = 1; // ✨ 그룹이 생성될 때마다 1씩 증가하여 고유 순서 부여
    
    async onload() {
        console.log('🚀 Tab Groups 플러그인 로드됨 (자동 밀착 정렬 기능 추가)');

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

                    // 기능 1: 그룹에서 제외
                    if (currentGroupId) {
                        menu.addItem((item) => {
                            item.setTitle('❌ 그룹에서 제외')
                                .onClick(() => {
                                    headerEl.removeAttribute('data-tab-group-id');
                                    headerEl.style.borderTop = '';
                                    headerEl.style.backgroundColor = '';
                                    headerEl.style.order = ''; // ✨ 정렬 순서 초기화 (일반 탭 위치로 복귀)
                                    console.log('✅ 탭이 그룹에서 제외되었습니다.');
                                });
                        });
                        menu.addSeparator();
                    }

                    // 기능 2: 기존 그룹에 탭 추가
                    if (this.groups.size > 0) {
                        this.groups.forEach((groupData, groupId) => {
                            if (groupId !== currentGroupId) {
                                menu.addItem((item) => {
                                    item.setTitle(`🎨 [${groupData.name}] 그룹에 넣기`)
                                        .onClick(() => {
                                            headerEl.setAttribute('data-tab-group-id', groupId);
                                            headerEl.style.borderTop = `3px solid ${groupData.color}`;
                                            headerEl.style.backgroundColor = `${groupData.color}1A`;
                                            
                                            // ✨ 핵심: 해당 그룹의 고유 번호를 order 속성에 부여하여 탭들을 한곳으로 모음
                                            headerEl.style.order = groupData.orderIndex.toString();
                                            
                                            console.log(`✅ [${groupData.name}] 그룹에 탭 추가 완료!`);
                                        });
                                });
                            }
                        });
                        menu.addSeparator();
                    }

                    // 기능 3: 완전히 새로운 그룹 만들기
                    menu.addItem((item) => {
                        item.setTitle('✨ 새 탭 그룹 만들기')
                            .setIcon('folder-plus')
                            .onClick(() => {
                                new CreateGroupModal(this.app, (groupName, color) => {
                                    const groupId = 'group-' + Date.now();
                                    const orderIndex = this.groupCounter++; // ✨ 새 그룹에 고유 순서 번호 발급
                                    
                                    this.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), orderIndex: orderIndex });
                                    
                                    headerEl.setAttribute('data-tab-group-id', groupId);
                                    headerEl.style.borderTop = `3px solid ${color}`;
                                    headerEl.style.backgroundColor = `${color}1A`;
                                    
                                    // ✨ 핵심: 첫 번째 탭도 해당 그룹의 순서 구역으로 이동
                                    headerEl.style.order = orderIndex.toString();
                                    
                                    console.log(`✅ 새 그룹 생성 완료: [${groupName}] (순서: ${orderIndex})`);
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