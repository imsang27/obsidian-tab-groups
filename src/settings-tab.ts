import { App, PluginSettingTab, Setting, SettingDefinitionItem, requireApiVersion } from 'obsidian';
import type TabGroupsPlugin from './main';
import { LANGUAGE_NAMES, Language, LanguageSetting, setLanguage, t } from './i18n';
import { GroupStyle } from './group-style';
import type { LabelTabCount } from './settings';
import { confirmDeleteGroup, reopenGroup } from './group-actions';

// ✨ 설정 → 커뮤니티 플러그인 → Tab Groups 화면
// 💡 옵시디언 1.13부터는 getSettingDefinitions()로 그려서 설정 검색에도 나옵니다.
// 그보다 오래된 버전은 display()로 그립니다. (두 곳의 내용을 함께 고쳐 주세요)
export class TabGroupsSettingTab extends PluginSettingTab {
    plugin: TabGroupsPlugin;
    // 💡 설정 화면에 마지막으로 넘긴 그룹 목록 (바뀌었을 때만 다시 그리려고)
    shownGroups = '';

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
                name: t('settings.labelTabCount'),
                desc: t('settings.labelTabCountDesc'),
                control: { type: 'dropdown', key: 'labelTabCount', options: this.labelTabCountOptions() },
            },
            {
                name: t('settings.removeEmptyGroups'),
                desc: t('settings.removeEmptyGroupsDesc'),
                control: { type: 'toggle', key: 'removeEmptyGroups' },
            },
            {
                name: t('settings.lockGroupedTabs'),
                desc: t('settings.lockGroupedTabsDesc'),
                control: { type: 'toggle', key: 'lockGroupedTabs' },
            },
            {
                type: 'list',
                heading: t('settings.groups'),
                emptyState: t('settings.noGroups'),
                items: groups.map(([groupId, group]) => ({
                    name: group.name || t('group.unnamed'),
                    desc: this.groupDesc(groupId),
                    // 💡 목록 기본 삭제 버튼(×)은 무엇을 지우는지 알기 어려워, 예전처럼 "그룹 삭제" 버튼을 직접 붙입니다.
                    render: (setting: Setting) => {
                        this.addSwatch(setting, group.color);
                        this.addReopenButton(setting, groupId);
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
        if (key === 'labelTabCount') await this.changeLabelTabCount(value as LabelTabCount);
        if (key === 'removeEmptyGroups') await this.changeRemoveEmptyGroups(value === true);
        if (key === 'lockGroupedTabs') await this.changeLockGroupedTabs(value === true);
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
            .setName(t('settings.labelTabCount'))
            .setDesc(t('settings.labelTabCountDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions(this.labelTabCountOptions())
                .setValue(this.plugin.settings.labelTabCount)
                .onChange(value => { void this.changeLabelTabCount(value as LabelTabCount); }));

        new Setting(containerEl)
            .setName(t('settings.removeEmptyGroups'))
            .setDesc(t('settings.removeEmptyGroupsDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeEmptyGroups)
                .onChange(value => { void this.changeRemoveEmptyGroups(value); }));

        new Setting(containerEl)
            .setName(t('settings.lockGroupedTabs'))
            .setDesc(t('settings.lockGroupedTabsDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.lockGroupedTabs)
                .onChange(value => { void this.changeLockGroupedTabs(value); }));

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
                .setDesc(this.groupDesc(groupId));
            this.addSwatch(setting, group.color);
            this.addReopenButton(setting, groupId);
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

    labelTabCountOptions(): Record<LabelTabCount, string> {
        return { off: t('settings.labelTabCountOff'), collapsed: t('settings.labelTabCountCollapsed'), all: t('settings.labelTabCountAll') };
    }

    addSwatch(setting: Setting, color: string) {
        const swatch = createSpan({ cls: 'tab-group-settings-swatch' });
        swatch.style.setProperty('--tab-group-color', color);
        setting.nameEl.prepend(swatch);
    }

    // 💡 숨은 그룹은 "숨김 · 저장된 탭 n개", 그 밖에는 열린 탭 수
    groupDesc(groupId: string): string {
        if (this.plugin.isGroupHidden(groupId)) {
            return t('settings.hiddenTabs', { count: String(this.plugin.groups.get(groupId)?.tabs.length ?? 0) });
        }
        return t('settings.openTabs', { count: String(this.plugin.groupLeaves(groupId).length) });
    }

    addReopenButton(setting: Setting, groupId: string) {
        if (!this.plugin.isGroupHidden(groupId)) return;
        setting.addButton(btn => btn
            .setButtonText(t('settings.reopen'))
            .setTooltip(t('settings.reopenTip'))
            .onClick(() => { void this.reopen(groupId); }));
    }

    async reopen(groupId: string) {
        await reopenGroup(this.plugin, groupId);
        this.refresh();
    }

    addDeleteButton(setting: Setting, groupId: string) {
        setting.addButton(btn => btn
            .setButtonText(t('settings.delete'))
            .setTooltip(t('settings.deleteTip'))
            .setWarning()
            .onClick(() => this.deleteGroup(groupId)));
    }

    // 💡 열린 탭이 있으면 확인 뒤 탭도 닫음 (크롬과 같음). 목록은 그룹이 바뀌면 다시 그림
    deleteGroup(groupId: string) {
        confirmDeleteGroup(this.plugin, groupId, () => this.refresh());
    }

    async changeLanguage(language: LanguageSetting) {
        this.plugin.settings.language = language;
        setLanguage(language);
        await this.plugin.saveSettings();
        // 💡 설정 화면 문구도 바로 새 언어로. 1.13부터는 포커스가 있는 줄(방금 고른 언어 드롭다운)은 다시 그리지 않아 포커스를 풀어 둡니다.
        const active = this.containerEl.doc.activeElement;
        if (active?.instanceOf(HTMLElement)) active.blur();
        this.refresh();
    }

    async changeGroupStyle(style: GroupStyle) {
        this.plugin.settings.groupStyle = style;
        this.plugin.applyGroupStyle();
        await this.plugin.saveSettings();
    }

    async changeLabelTabCount(count: LabelTabCount) {
        this.plugin.settings.labelTabCount = count;
        this.plugin.enforcePhysicalSorting(); // 💡 라벨을 다시 그려 개수를 바로 보이거나 숨김
        await this.plugin.saveSettings();
    }

    async changeRemoveEmptyGroups(remove: boolean) {
        this.plugin.settings.removeEmptyGroups = remove;
        await this.plugin.saveSettings();
    }

    async changeLockGroupedTabs(enabled: boolean) {
        this.plugin.settings.lockGroupedTabs = enabled;
        await this.plugin.saveSettings();
    }

    // 💡 1.13부터는 저장해 둔 정의로 그려서, 그룹이 바뀌면 다시 받아 둬야 설정을 열 때 지금 목록이 보입니다.
    // 1.13 미만은 열 때마다 display()가 새로 그리므로, 설정을 열어 둔 채 바뀐 때만 다시 그립니다.
    // 탭 배치가 바뀔 때마다 불리므로 목록에 보이는 내용이 달라졌을 때만 합니다.
    updateGroups() {
        const shown = JSON.stringify([...this.plugin.groups.entries()].map(([groupId, group]) => [group.name, group.color, this.groupDesc(groupId)]));
        if (shown === this.shownGroups) return;
        this.shownGroups = shown;
        if (requireApiVersion('1.13.0') || this.containerEl.isShown()) this.refresh();
    }

    refresh() {
        if (requireApiVersion('1.13.0')) this.update();
        else this.display();
    }
}
