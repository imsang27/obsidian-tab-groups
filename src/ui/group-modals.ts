import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';
import { renderColorPalette } from './color-palette';

export type GroupAction = 'close' | 'delete' | 'ungroup';

export class CreateGroupModal extends Modal {
    groupName: string = '';
    groupColor: string;
    onSubmit: (groupName: string, color: string) => void | Promise<void>;

    constructor(app: App, initialColor: string, onSubmit: (groupName: string, color: string) => void | Promise<void>) {
        super(app);
        this.groupColor = initialColor;
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
                text.onChange((val) => this.groupName = val);
                onEnter(text.inputEl, () => this.submit());
                window.setTimeout(() => text.inputEl.focus(), 0);
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
        onAction: (action: GroupAction) => void | Promise<void>
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

        // ✨ 3가지 액션 버튼 영역 (닫기, 삭제, 해제를 한 줄에 나란히 배치)
        new Setting(contentEl)
            .setName(t('modal.actions'))
            .addButton((btn) => btn
                .setButtonText(t('modal.closeGroup'))
                .setTooltip(t('modal.closeGroupTip'))
                .setWarning() // 노란색/빨간색 경고
                .onClick(() => { this.close(); void this.onAction('close'); })
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.deleteGroup'))
                .setTooltip(t('modal.deleteGroupTip'))
                .setWarning() // 노란색/빨간색 경고
                .onClick(() => { this.close(); void this.onAction('delete'); })
            )
            .addButton((btn) => btn
                .setButtonText(t('modal.ungroup'))
                .setTooltip(t('modal.ungroupTip'))
                .onClick(() => { this.close(); void this.onAction('ungroup'); })
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

// 💡 이름 칸에서 Enter를 누르면 만들기·저장 (한글 등 입력 조합 중의 Enter는 무시)
function onEnter(inputEl: HTMLInputElement, submit: () => void) {
    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        submit();
    });
}
