import { App, PluginSettingTab, Setting, SettingDefinitionItem, requireApiVersion } from 'obsidian';
import type TabGroupsPlugin from './main';
import { LANGUAGE_NAMES, Language, LanguageSetting, setLanguage, t } from './i18n';
import { GroupStyle } from './group-style';

// ✨ 설정 → 커뮤니티 플러그인 → Tab Groups 화면
// 💡 옵시디언 1.13부터는 getSettingDefinitions()로 그려서 설정 검색에도 나옵니다.
// 그보다 오래된 버전은 display()로 그립니다. (두 곳의 내용을 함께 고쳐 주세요)
export class TabGroupsSettingTab extends PluginSettingTab {
    plugin: TabGroupsPlugin;

    constructor(app: App, plugin: TabGroupsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const groups = [...this.plugin.groups.entries()];
        return [
            {
                name: t('settings.language'),
                desc: t('settings.languageDesc'),
                control: { type: 'dropdown', key: 'language', options: this.languageOptions() },
            },
            {
                name: t('settings.groupStyle'),
                desc: t('settings.groupStyleDesc'),
                control: { type: 'dropdown', key: 'groupStyle', options: this.groupStyleOptions() },
            },
            {
                name: t('settings.removeEmptyGroups'),
                desc: t('settings.removeEmptyGroupsDesc'),
                control: { type: 'toggle', key: 'removeEmptyGroups' },
            },
            {
                type: 'list',
                heading: t('settings.groups'),
                emptyState: t('settings.noGroups'),
                items: groups.map(([groupId, group]) => ({
                    name: group.name || t('group.unnamed'),
                    desc: t('settings.openTabs', { count: String(this.plugin.groupLeaves(groupId).length) }),
                    // 💡 목록 기본 삭제 버튼(×)은 무엇을 지우는지 알기 어려워, 예전처럼 "그룹 삭제" 버튼을 직접 붙입니다.
                    render: (setting: Setting) => {
                        this.addSwatch(setting, group.color);
                        this.addDeleteButton(setting, groupId);
                    },
                })),
            },
        ];
    }

    // 💡 언어는 저장하고 끝이 아니라 바로 적용하고 화면 문구도 바꿔야 해서 직접 처리합니다.
    async setControlValue(key: string, value: unknown) {
        if (key === 'language') await this.changeLanguage(value as LanguageSetting);
        if (key === 'groupStyle') await this.changeGroupStyle(value as GroupStyle);
        if (key === 'removeEmptyGroups') await this.changeRemoveEmptyGroups(value === true);
    }

    // 💡 옵시디언 1.13 미만용
    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(t('settings.language'))
            .setDesc(t('settings.languageDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions(this.languageOptions())
                .setValue(this.plugin.settings.language)
                .onChange(value => { void this.changeLanguage(value as LanguageSetting); }));

        new Setting(containerEl)
            .setName(t('settings.groupStyle'))
            .setDesc(t('settings.groupStyleDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions(this.groupStyleOptions())
                .setValue(this.plugin.settings.groupStyle)
                .onChange(value => { void this.changeGroupStyle(value as GroupStyle); }));

        new Setting(containerEl)
            .setName(t('settings.removeEmptyGroups'))
            .setDesc(t('settings.removeEmptyGroupsDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeEmptyGroups)
                .onChange(value => { void this.changeRemoveEmptyGroups(value); }));

        this.displayGroups(containerEl);
    }

    // 💡 그룹 목록: 열린 탭이 없는 그룹도 여기서 확인하고 지울 수 있습니다.
    displayGroups(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t('settings.groups'))
            .setDesc(t('settings.groupsDesc'))
            .setHeading();

        const groups = [...this.plugin.groups.entries()];
        if (groups.length === 0) {
            containerEl.createEl('p', { text: t('settings.noGroups'), cls: 'setting-item-description' });
            return;
        }

        groups.forEach(([groupId, group]) => {
            const setting = new Setting(containerEl)
                .setName(group.name || t('group.unnamed'))
                .setDesc(t('settings.openTabs', { count: String(this.plugin.groupLeaves(groupId).length) }));
            this.addSwatch(setting, group.color);
            this.addDeleteButton(setting, groupId);
        });
    }

    languageOptions(): Record<string, string> {
        const options: Record<string, string> = { auto: t('settings.languageAuto') };
        for (const lang of Object.keys(LANGUAGE_NAMES) as Language[]) options[lang] = LANGUAGE_NAMES[lang];
        return options;
    }

    groupStyleOptions(): Record<GroupStyle, string> {
        return { underline: t('settings.groupStyleUnderline'), classic: t('settings.groupStyleClassic') };
    }

    addSwatch(setting: Setting, color: string) {
        const swatch = createSpan({ cls: 'tab-group-settings-swatch' });
        swatch.style.setProperty('--tab-group-color', color);
        setting.nameEl.prepend(swatch);
    }

    addDeleteButton(setting: Setting, groupId: string) {
        setting.addButton(btn => btn
            .setButtonText(t('settings.delete'))
            .setTooltip(t('settings.deleteTip'))
            .setWarning()
            .onClick(() => { void this.deleteGroup(groupId); }));
    }

    async deleteGroup(groupId: string) {
        await this.plugin.deleteGroup(groupId);
        this.refresh();
    }

    async changeLanguage(language: LanguageSetting) {
        this.plugin.settings.language = language;
        setLanguage(language);
        await this.plugin.saveSettings();
        this.refresh(); // 💡 설정 화면 문구도 바로 새 언어로
    }

    async changeGroupStyle(style: GroupStyle) {
        this.plugin.settings.groupStyle = style;
        this.plugin.applyGroupStyle();
        await this.plugin.saveSettings();
    }

    async changeRemoveEmptyGroups(remove: boolean) {
        this.plugin.settings.removeEmptyGroups = remove;
        await this.plugin.saveSettings();
    }

    refresh() {
        if (requireApiVersion('1.13.0')) this.update();
        else this.display();
    }
}
