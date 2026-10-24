import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { createGroup, groupCount, label, resetWorkspace, tabHeader, tabs, waitForMembers } from '../helpers';

// 💡 설정 → 커뮤니티 플러그인 → Tab Groups 화면을 사람처럼 조작합니다.
// 옵시디언 1.13부터는 getSettingDefinitions(), 그 전에는 display()로 그려서 latest와 earliest가 서로 다른 코드를 확인합니다.
// 1.14부터는 설정이 따로 창(팝아웃)으로 열리고, 그 전에는 지금 창 안의 모달로 열립니다.

let mainWindow = '';
let settingsWindow = '';

async function openSettings() {
    mainWindow = await browser.getWindowHandle();
    const before = await browser.getWindowHandles();
    await browser.executeObsidian(({ app }) => {
        const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
        setting.open();
        setting.openTabById('tab-groups');
    });
    // 💡 새 창이 열리면 그 창으로, 아니면 지금 창의 모달
    await browser.pause(300);
    settingsWindow = (await browser.getWindowHandles()).find(handle => !before.includes(handle)) ?? mainWindow;
    await browser.switchToWindow(settingsWindow);
    await settingItem('Group style').waitForDisplayed();
}

async function closeSettings() {
    if (!mainWindow) return;
    await browser.switchToWindow(mainWindow);
    await browser.executeObsidian(({ app }) => (app as unknown as { setting: { close(): void } }).setting.close());
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1 && !(await $('.mod-settings').isExisting()), {
        timeoutMsg: 'the settings stayed open',
    });
    mainWindow = '';
}

// 💡 설정을 연 채로 메인 창의 탭·그룹을 보고 다시 설정 쪽으로 돌아옵니다.
async function inMainWindow<T>(check: () => Promise<T>): Promise<T> {
    await browser.switchToWindow(mainWindow);
    try {
        return await check();
    } finally {
        await browser.switchToWindow(settingsWindow);
    }
}

// 💡 이름(앞부분)이 name인 설정 줄 (그룹 줄은 이름 앞에 색 견본이 붙음)
// 클래스는 낱말 단위로 맞춤: 1.14는 줄들을 감싸는 요소의 클래스에도 "setting-item"이 들어 있음
function settingItem(name: string) {
    const hasClass = (cls: string) => `contains(concat(" ", normalize-space(@class), " "), " ${cls} ")`;
    return $(`//div[${hasClass('mod-settings')}]//div[${hasClass('setting-item')}][.//div[${hasClass('setting-item-name')}][starts-with(normalize-space(), "${name}")]]`);
}

function noGroupsText() {
    return $('//div[contains(@class, "mod-settings")]//*[contains(text(), "No groups yet.")]');
}

async function savedSetting(key: string): Promise<unknown> {
    return browser.executeObsidian(({ plugins }, key) => (plugins.tabGroups as unknown as { settings: Record<string, unknown> }).settings[key], key);
}

async function closeTab(title: string) {
    await tabHeader(title).click();
    await browser.keys([Key.Ctrl, 'w']);
    await browser.waitUntil(async () => !(await tabs()).some(info => info.title === title));
}

describe('settings tab', function () {
    afterEach(async function () {
        await closeSettings();
        // 💡 다른 테스트가 영어 문구로 찾으므로, 테스트가 실패해도 언어는 자동으로 되돌림
        await browser.executeObsidian(async ({ app }) => {
            type Tab = { id: string; changeLanguage(language: string): Promise<void> };
            const tab = (app as unknown as { setting: { pluginTabs: Tab[] } }).setting.pluginTabs.find(tab => tab.id === 'tab-groups');
            await tab?.changeLanguage('auto');
        });
    });

    it('applies the group style as soon as it is chosen', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await openSettings();

        await settingItem('Group style').$('select').selectByAttribute('value', 'classic');
        await inMainWindow(() => expect($('body')).toHaveElementClass('tab-groups-style-classic'));
        expect(await savedSetting('groupStyle')).toBe('classic');

        await settingItem('Group style').$('select').selectByAttribute('value', 'underline');
        await inMainWindow(() => expect($('body')).not.toHaveElementClass('tab-groups-style-classic'));
        expect(await savedSetting('groupStyle')).toBe('underline');
    });

    it('shows the tab count on labels as soon as it is chosen', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await createGroup('Alpha', 'Work');
        await openSettings();

        await settingItem('Tab count on group labels').$('select').selectByAttribute('value', 'all');
        expect(await savedSetting('labelTabCount')).toBe('all');
        await inMainWindow(() => expect(label('Work').$('.tab-group-label-count')).toHaveText('1'));

        await settingItem('Tab count on group labels').$('select').selectByAttribute('value', 'off');
        await inMainWindow(() => expect(label('Work').$('.tab-group-label-count')).not.toBeExisting());
    });

    it('saves the toggles and shows them again when reopened', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await openSettings();

        await settingItem('Remove a group when its last tab closes').$('.checkbox-container').click();
        await settingItem('Lock grouped tabs').$('.checkbox-container').click();
        await settingItem('Suggest a name and color for new groups').$('.checkbox-container').click();
        await browser.waitUntil(async () => (await savedSetting('removeEmptyGroups')) === true && (await savedSetting('lockGroupedTabs')) === true && (await savedSetting('suggestGroupName')) === true, {
            timeoutMsg: 'the toggles were not saved',
        });

        await closeSettings();
        await openSettings();
        await expect(settingItem('Remove a group when its last tab closes').$('.checkbox-container')).toHaveElementClass('is-enabled');
        await expect(settingItem('Lock grouped tabs').$('.checkbox-container')).toHaveElementClass('is-enabled');
        await expect(settingItem('Suggest a name and color for new groups').$('.checkbox-container')).toHaveElementClass('is-enabled');

        // 💡 바꾼 설정이 실제 동작에도 쓰임: 마지막 탭을 닫으면 그룹도 지워짐
        await closeSettings();
        await createGroup('Alpha', 'Work');
        await closeTab('Alpha');
        await browser.waitUntil(async () => (await groupCount()) === 0, { timeoutMsg: 'the group was not removed' });
    });

    it('changes its own text when the language changes', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await openSettings();
        await settingItem('Language').$('select').selectByAttribute('value', 'ko');
        expect(await savedSetting('language')).toBe('ko');
        await settingItem('그룹 표시 모양').waitForDisplayed({ timeoutMsg: 'the settings were not shown in Korean' });

        await settingItem('언어').$('select').selectByAttribute('value', 'auto');
        await settingItem('Language').waitForDisplayed({ timeoutMsg: 'the settings were not shown in English again' });
    });

    it('lists the groups with their open tabs', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await openSettings();
        await expect(noGroupsText()).toBeDisplayed();
        await closeSettings();

        await createGroup('Alpha', 'Work');
        await openSettings();
        await expect(settingItem('Work').$('.setting-item-description')).toHaveText('1 open tabs');
        await expect(settingItem('Work').$('button=Reopen')).not.toBeExisting();
    });

    it('updates the list when a group changes while it is open', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await createGroup('Alpha', 'Work');
        await openSettings();
        await expect(settingItem('Work').$('.setting-item-description')).toHaveText('1 open tabs');

        // 💡 설정을 연 채 그룹의 마지막 탭을 닫음 (1.14 미만은 설정이 창을 덮어 탭을 직접 누를 수 없어서 명령으로 닫음)
        await browser.executeObsidian(({ app }) => {
            app.workspace.iterateAllLeaves(leaf => { if (leaf.getDisplayText() === 'Alpha') leaf.detach(); });
        });
        await expect(settingItem('Work').$('.setting-item-description')).toHaveText('Hidden · 1 saved tabs');
        await expect(settingItem('Work').$('button=Reopen')).toBeDisplayed();
    });

    it('reopens a hidden group from the list', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await createGroup('Alpha', 'Work');
        await closeTab('Alpha');
        await openSettings();

        await expect(settingItem('Work').$('.setting-item-description')).toHaveText('Hidden · 1 saved tabs');
        await settingItem('Work').$('button=Reopen').click();

        await inMainWindow(async () => {
            await label('Work').waitForExist();
            await waitForMembers('Work', ['Alpha']);
        });
        await expect(settingItem('Work').$('.setting-item-description')).toHaveText('1 open tabs');
    });

    it('deletes a group and its tabs after confirming', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await createGroup('Alpha', 'Work');
        await openSettings();

        await settingItem('Work').$('button=Delete group').click();
        // 💡 확인 창은 설정 위에 뜨는 마지막 모달
        const confirm = $('(//div[contains(@class, "modal-container")])[last()]');
        await confirm.$('button=Delete').waitForDisplayed();
        await confirm.$('button=Delete').click();

        await browser.waitUntil(async () => (await groupCount()) === 0, { timeoutMsg: 'the group was not deleted' });
        await expect(noGroupsText()).toBeDisplayed();
        await inMainWindow(() => browser.waitUntil(async () => (await tabs()).map(info => info.title).join() === 'Beta', {
            timeoutMsg: "the group's tab was not closed",
        }));
    });

    // 💡 그룹 세트: + 버튼으로 지금 그룹들을 저장하고, 세트마다 열거나 지움
    const setNames = async () => (await savedSetting('groupSets') as { name: string }[]).map(set => set.name);

    it('saves the current groups as a set from the + button', async function () {
        await resetWorkspace(['Alpha', 'Beta']);
        await createGroup('Alpha', 'Work');
        await openSettings();
        await expect($('//div[contains(@class, "mod-settings")]//*[contains(text(), "No saved sets yet.")]')).toBeDisplayed();

        await $('.mod-settings [aria-label="Save the current groups as a set"]').click();
        const input = $('(//div[contains(@class, "modal-container")])[last()]//input[@type="text"]');
        await input.waitForDisplayed({ timeoutMsg: 'no name window' });
        await input.setValue('Trip');
        await browser.keys(Key.Enter);

        await browser.waitUntil(async () => (await setNames()).join() === 'Trip', { timeoutMsg: 'the set was not saved' });
        await expect(settingItem('Trip').$('.setting-item-description')).toHaveText('1 groups · 1 tabs');
    });

    it('opens a saved set and deletes it from the list', async function () {
        await resetWorkspace(['Alpha']);
        await browser.executeObsidian(async ({ plugins }) => {
            const plugin = plugins.tabGroups as unknown as { settings: { groupSets: unknown[] }; saveSettings(): Promise<void> };
            plugin.settings.groupSets = [{
                name: 'Trip',
                groups: [{ name: 'Plan', color: '#e03131', isCollapsed: false, tabs: [
                    { type: 'markdown', state: { file: 'Gamma.md' } },
                    { type: 'markdown', state: { file: 'Delta.md' } },
                ] }],
            }];
            await plugin.saveSettings();
        });
        await openSettings();
        await expect(settingItem('Trip').$('.setting-item-description')).toHaveText('1 groups · 2 tabs');

        await settingItem('Trip').$('button=Open').click();
        await inMainWindow(async () => {
            await label('Plan').waitForExist({ timeoutMsg: 'the set did not open' });
            await waitForMembers('Plan', ['Gamma', 'Delta']);
        });

        await settingItem('Trip').$('button=Delete set').click();
        await browser.waitUntil(async () => (await setNames()).length === 0, { timeoutMsg: 'the set was not deleted' });
        await expect($('//div[contains(@class, "mod-settings")]//*[contains(text(), "No saved sets yet.")]')).toBeDisplayed();
        // 열린 탭은 그대로
        expect(await groupCount()).toBe(1);
    });
});
