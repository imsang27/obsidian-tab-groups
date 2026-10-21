import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, clickButton, createGroup, groupCount, label, members, resetWorkspace, runCommand, choose, tab, tabHeader, titles, waitForMembers } from '../helpers';

// 💡 닫은 탭 다시 열기(Ctrl+Shift+T)로 연 탭이 원래 그룹·자리로 돌아오는지
// 시작: [Work] Alpha Beta Gamma | Delta
describe('reopening closed tabs', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await addToGroup('Gamma', 'Work');
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
    });

    async function closeTab(title: string) {
        await tabHeader(title).click();
        await runCommand('Close current tab');
        await browser.waitUntil(async () => !(await titles()).includes(title), { timeoutMsg: `${title} stayed open` });
    }

    // 💡 사람처럼 단축키로
    async function undoClose() {
        await browser.keys([Key.Ctrl, Key.Shift, 't']);
    }

    it('reopens a closed tab in its group, in the same place', async function () {
        await closeTab('Beta');
        await waitForMembers('Work', ['Alpha', 'Gamma']);

        await undoClose();
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
        expect((await tab('Beta')).active).toBe(true);
    });

    it('reopens tabs closed one after another into the group', async function () {
        await closeTab('Alpha');
        await closeTab('Gamma');

        await undoClose();
        await waitForMembers('Work', ['Beta', 'Gamma']);
        await undoClose();
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    });

    it('expands a collapsed group to show the reopened tab', async function () {
        await closeTab('Beta');
        await tabHeader('Delta').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden, { timeoutMsg: 'the group did not collapse' });

        await undoClose();
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
        await expect(label('Work')).not.toHaveElementClass('is-collapsed');
        expect((await tab('Beta')).hidden).toBe(false);
    });

    it('keeps a tab that was not in a group out of groups', async function () {
        await closeTab('Delta');
        await undoClose();
        await browser.waitUntil(async () => (await titles()).includes('Delta'), { timeoutMsg: 'Delta did not reopen' });
        expect((await tab('Delta')).group).toBeNull();
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
    });

    it('brings back a group removed when its last tab closed', async function () {
        await browser.executeObsidian(async ({ plugins }) => {
            const plugin = plugins.tabGroups as unknown as { settings: Record<string, unknown>; saveSettings(): Promise<void> };
            plugin.settings.removeEmptyGroups = true;
            await plugin.saveSettings();
        });
        await closeTab('Alpha');
        await closeTab('Beta');
        await closeTab('Gamma');
        await browser.waitUntil(async () => (await groupCount()) === 0, { timeoutMsg: 'the empty group stayed' });

        await undoClose();
        await label('Work').waitForExist({ timeoutMsg: 'the group did not come back' });
        await waitForMembers('Work', ['Gamma']);
    });

    it('reopens a whole hidden group at once', async function () {
        await label('Work').click({ button: 'right' });
        await clickButton('Hide group');
        await browser.waitUntil(async () => (await titles()).join() === 'Delta', { timeoutMsg: 'the group tabs stayed open' });

        await undoClose();
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
        expect(await titles()).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma']);
        await expect(label('Work')).not.toHaveElementClass('is-collapsed');

        // 💡 한 번에 다 열렸으니 더 열 탭이 없음
        await undoClose();
        await browser.pause(500);
        expect(await titles()).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma']);
    });

    it('reopens every tab of a hidden group with more tabs than Obsidian remembers', async function () {
        // 💡 옵시디언은 닫은 탭을 10개까지만 기억함: 그룹에 탭 12개
        const extra = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Alpha'];
        await browser.executeObsidian(async ({ app, plugins }, extra) => {
            type Leaf = { parent: { children: unknown[] }; getDisplayText(): string };
            const plugin = plugins.tabGroups as unknown as { leafGroupMap: WeakMap<object, string>; enforcePhysicalSorting(): void; saveSettings(): Promise<void> };
            let gamma: Leaf | null = null;
            app.workspace.iterateAllLeaves(leaf => { if ((leaf as unknown as Leaf).getDisplayText() === 'Gamma') gamma = leaf as unknown as Leaf; });
            const anchor = gamma as unknown as Leaf;
            const groupId = plugin.leafGroupMap.get(anchor)!;
            for (const name of extra) {
                const leaf = app.workspace.createLeafInParent(anchor.parent as never, anchor.parent.children.length);
                await leaf.openFile(app.vault.getFileByPath(`${name}.md`)!, { active: false });
                plugin.leafGroupMap.set(leaf, groupId);
            }
            await plugin.saveSettings();
            plugin.enforcePhysicalSorting();
        }, extra);
        const all = ['Alpha', 'Beta', 'Gamma', ...extra];
        await waitForMembers('Work', all);

        await label('Work').click({ button: 'right' });
        await clickButton('Hide group');
        await browser.waitUntil(async () => (await titles()).join() === 'Delta', { timeoutMsg: 'the group tabs stayed open' });

        await undoClose();
        await waitForMembers('Work', all);
        expect(await titles()).toEqual(['Delta', ...all]);
    });

    it('brings back a deleted group with its tabs', async function () {
        await label('Work').click({ button: 'right' });
        await clickButton('Delete group');
        await clickButton('Delete');
        await browser.waitUntil(async () => (await groupCount()) === 0, { timeoutMsg: 'the group stayed' });

        await undoClose();
        await label('Work').waitForExist({ timeoutMsg: 'the group did not come back' });
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);
    });

    it('does not open the tabs again after the hidden group was reopened another way', async function () {
        await label('Work').click({ button: 'right' });
        await clickButton('Hide group');
        await browser.waitUntil(async () => (await titles()).join() === 'Delta', { timeoutMsg: 'the group tabs stayed open' });
        await runCommand('Tab Groups: Reopen a hidden group');
        await choose('Work');
        await waitForMembers('Work', ['Alpha', 'Beta', 'Gamma']);

        await undoClose();
        await browser.pause(500);
        expect(await titles()).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma']);
        expect((await members('Work'))).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('does not bring back an ungrouped group', async function () {
        await closeTab('Beta');
        await label('Work').click({ button: 'right' });
        await clickButton('Ungroup');
        await expect(label('Work')).not.toBeExisting();

        await undoClose();
        await browser.waitUntil(async () => (await titles()).includes('Beta'), { timeoutMsg: 'Beta did not reopen' });
        expect((await tab('Beta')).group).toBeNull();
        expect(await groupCount()).toBe(0);
        await expect($('.tab-group-label')).not.toBeExisting();
    });
});
