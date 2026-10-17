import { App, PluginSettingTab, Setting } from 'obsidian';
import type TabGroupsPlugin from './main';
import { LANGUAGE_NAMES, Language, LanguageSetting, setLanguage, t } from './i18n';

// ✨ 설정 → 커뮤니티 플러그인 → Tab Groups 화면
export class TabGroupsSettingTab extends PluginSettingTab {
    plugin: TabGroupsPlugin;

    constructor(app: App, plugin: TabGroupsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(t('settings.language'))
            .setDesc(t('settings.languageDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('auto', t('settings.languageAuto'));
                for (const lang of Object.keys(LANGUAGE_NAMES) as Language[]) dropdown.addOption(lang, LANGUAGE_NAMES[lang]);
                dropdown
                    .setValue(this.plugin.settings.language)
                    .onChange(value => { void this.changeLanguage(value as LanguageSetting); });
            });

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
                .setDesc(t('settings.openTabs', { count: String(this.plugin.groupLeaves(groupId).length) }))
                .addButton(btn => btn
                    .setButtonText(t('settings.delete'))
                    .setTooltip(t('settings.deleteTip'))
                    .setWarning()
                    .onClick(() => { void this.deleteGroup(groupId); }));
            const swatch = createSpan({ cls: 'tab-group-settings-swatch' });
            swatch.style.setProperty('--tab-group-color', group.color);
            setting.nameEl.prepend(swatch);
        });
    }

    async deleteGroup(groupId: string) {
        await this.plugin.deleteGroup(groupId);
        this.display();
    }

    async changeLanguage(language: LanguageSetting) {
        this.plugin.settings.language = language;
        setLanguage(language);
        await this.plugin.saveSettings();
        this.display(); // 💡 설정 화면 문구도 바로 새 언어로
    }
}
