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
    }

    async changeLanguage(language: LanguageSetting) {
        this.plugin.settings.language = language;
        setLanguage(language);
        await this.plugin.saveSettings();
        this.display(); // 💡 설정 화면 문구도 바로 새 언어로
    }
}
