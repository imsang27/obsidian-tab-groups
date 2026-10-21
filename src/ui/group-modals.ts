import { App, Modal, Notice, Setting } from 'obsidian';
import { t } from '../i18n';
import { renderColorPalette } from './color-palette';

export type GroupAction = 'hide' | 'ungroup' | 'delete' | 'newTab' | 'newWindow';

export class CreateGroupModal extends Modal {
    groupName: string = '';
    groupColor: string;
    onSubmit: (groupName: string, color: string) => void | Promise<void>;

    // 💡 initialName: 미리 채울 이름 (설정에서 이름 제안을 켰을 때)
    constructor(app: App, initialColor: string, onSubmit: (groupName: string, color: string) => void | Promise<void>, initialName = '') {
        super(app);
        this.groupColor = initialColor;
        this.groupName = initialName;
        this.onSubmit = onSubmit;
    }

    submit() {
        this.close();
        void this.onSubmit(this.groupName, this.groupColor);
    }

    onOpen() {
        const { contentEl } = this;
        this.titleEl.setText(t('modal.createTitle'));

        new Setting(contentEl)
            .setName(t('modal.name'))
            .setDesc(t('modal.nameDesc'))
            .addText((text) => {
                text.setValue(this.groupName);
                text.onChange((val) => this.groupName = val);
                onEnter(text.inputEl, () => this.submit());
                // 💡 제안한 이름은 골라 둬서, 바로 치면 새 이름으로 바뀜
                window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 0);
            });

        const colorSetting = new Setting(contentEl)
            .setName(t('modal.color'));

        // 기존의 투박한 기본 피커를 날려버리고, 우리가 만든 예쁜 팔레트로 대체!
        colorSetting.controlEl.empty();
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });

        new Setting(contentEl)
            .addButton((btn) => btn.setButtonText(t('modal.create')).setCta().onClick(() => this.submit()));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ✨ 수정: 3가지 액션(닫기, 삭제, 해제) 버튼을 직관적으로 제공하는 관리 모달
export class EditGroupModal extends Modal {
    groupName: string;
    groupColor: string;
    onSubmit: (groupName: string, color: string) => void | Promise<void>;
    onAction: (action: GroupAction) => void | Promise<void>;

    constructor(
        app: App,
        initialName: string,
        initialColor: string,
        onSubmit: (groupName: string, color: string) => void | Promise<void>,
        onAction: (action: GroupAction) => void | Promise<void>,
        ) {
        super(app);
        this.groupName = initialName;
        this.groupColor = initialColor;
        this.onSubmit = onSubmit;
        this.onAction = onAction;
    }

    onOpen() {
        const { contentEl } = this;
        this.titleEl.setText(t('modal.editTitle'));

        new Setting(contentEl)
            .setName(t('modal.name'))
            .addText((text) => {
                text.setValue(this.groupName);
                text.onChange((val) => this.groupName = val);
                onEnter(text.inputEl, () => this.submit());
            });

        const colorSetting = new Setting(contentEl)
            .setName(t('modal.color'));

        colorSetting.controlEl.empty();
        renderColorPalette(colorSetting.controlEl, this.groupColor, (newColor) => {
            this.groupColor = newColor;
        });

        // ✨ 3가지 액션 (크롬과 같은 순서·뜻): 숨기기(나중에 다시 열기), 해제(탭은 남김), 삭제(탭도 닫음)
        new Setting(contentEl)
            .setName(t('modal.actions'))
            .addButton((btn) => btn
                .setButtonText(t('modal.hideGroup'))
                .setTooltip(t('modal.hideGroupTip'))
                .onClick(() => { this.close(); void this.onAction('hide'); }),
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.ungroup'))
                .setTooltip(t('modal.ungroupTip'))
                .onClick(() => { this.close(); void this.onAction('ungroup'); }),
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.deleteGroup'))
                .setTooltip(t('modal.deleteGroupTip'))
                .setWarning()
                .onClick(() => { this.close(); void this.onAction('delete'); }),
            );

        // ✨ 그룹의 탭 다루기 (크롬 그룹 메뉴의 "그룹에 새 탭 추가", "그룹을 새 창으로 이동")
        new Setting(contentEl)
            .setName(t('modal.tabActions'))
            .addButton((btn) => btn
                .setButtonText(t('modal.newTab'))
                .setTooltip(t('modal.newTabTip'))
                .onClick(() => { this.close(); void this.onAction('newTab'); }),
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.newWindow'))
                .setTooltip(t('modal.newWindowTip'))
                .onClick(() => { this.close(); void this.onAction('newWindow'); }),
            );

        // ✨ 맨 하단 저장 버튼
        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText(t('modal.save'))
                .setCta() // 파란색 강조 스타일 적용
                .onClick(() => this.submit()));
    }

    submit() {
        this.close();
        void this.onSubmit(this.groupName, this.groupColor);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ✨ 탭이 닫히는 동작 전 확인 창 (그룹 삭제: 탭도 닫힘)
export class ConfirmModal extends Modal {
    constructor(app: App, private title: string, private message: string, private confirmText: string, private onConfirm: () => void | Promise<void>) {
        super(app);
    }

    onOpen() {
        this.titleEl.setText(this.title);
        this.contentEl.createEl('p', { text: this.message });
        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText(t('confirm.cancel'))
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText(this.confirmText)
                .setWarning()
                .onClick(() => { this.close(); void this.onConfirm(); }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

// 💡 이름 칸에서 Enter를 누르면 만들기·저장 (한글 등 입력 조합 중의 Enter는 무시)
// ✨ 그룹 세트 이름 묻기 (같은 이름이면 그 세트를 바꿔 씀)
export class GroupSetNameModal extends Modal {
    name = '';
    inputEl: HTMLInputElement | null = null;

    constructor(app: App, private onSubmit: (name: string) => void | Promise<void>) {
        super(app);
    }

    // 💡 이름이 비었으면 알리고 창은 열어 둠 (설정 탭의 "새 세트" 줄과 같음)
    submit() {
        const name = this.name.trim();
        if (!name) {
            new Notice(t('settings.setNameRequired'));
            this.inputEl?.focus();
            return;
        }
        this.close();
        void this.onSubmit(name);
    }

    onOpen() {
        this.titleEl.setText(t('modal.setTitle'));
        new Setting(this.contentEl)
            .setName(t('modal.setName'))
            .setDesc(t('modal.setNameDesc'))
            .addText((text) => {
                text.onChange((val) => this.name = val);
                this.inputEl = text.inputEl;
                onEnter(text.inputEl, () => this.submit());
                window.setTimeout(() => text.inputEl.focus(), 0);
            });
        new Setting(this.contentEl)
            .addButton((btn) => btn.setButtonText(t('modal.save')).setCta().onClick(() => this.submit()));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export function onEnter(inputEl: HTMLInputElement, submit: () => void) {
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        submit();
    });
}
