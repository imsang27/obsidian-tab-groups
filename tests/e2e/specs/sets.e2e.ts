import { $, $$, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, choose, createGroup, groupCount, label, resetWorkspace, runCommand, tab, tabHeader, tabs, waitForMembers } from '../helpers';

// 💡 그룹 세트: 그룹 구성을 이름 붙여 저장했다가 다시 엽니다.
// 시작: [Work] Alpha Beta | [Play] Gamma | Delta
describe('group sets', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await createGroup('Gamma', 'Play');
    });

    async function saveSet(name: string) {
        await runCommand('Tab Groups: Save the current groups as a set');
        const input = $('.modal input[type="text"]');
        await input.waitForDisplayed();
        await browser.keys(name);
        await browser.keys(Key.Enter);
        await browser.waitUntil(async () => (await $$('.notice').map(el => el.getText())).some(text => text.includes(`"${name}"`)), { timeoutMsg: 'no notice after saving' });
    }

    type SavedSet = { name: string; groups: { name: string; isCollapsed: boolean; tabs: { state?: { file?: string } }[] }[] };
    async function savedSets(): Promise<SavedSet[]> {
        const json = await browser.executeObsidian(({ plugins }) => JSON.stringify((plugins.tabGroups as unknown as { settings: { groupSets: unknown } }).settings.groupSets));
        return JSON.parse(json) as SavedSet[];
    }

    // 💡 세트는 남긴 채 그룹을 풀고 그 탭들을 닫음
    async function closeGroups() {
        await browser.executeObsidian(async ({ plugins }) => {
            const plugin = plugins.tabGroups as unknown as { groups: Map<string, unknown>; deleteGroup(id: string): Promise<void> };
            for (const id of [...plugin.groups.keys()]) await plugin.deleteGroup(id);
        });
        await browser.waitUntil(async () => (await tabs()).map(info => info.title).join() === 'Delta', { timeoutMsg: 'the group tabs stayed open' });
    }

    it('saves the groups and opens them again, collapsed or not', async function () {
        await tabHeader('Delta').click();
        await label('Play').click();
        await browser.waitUntil(async () => (await tab('Gamma')).hidden);
        await saveSet('Morning');

        await closeGroups();
        await runCommand('Tab Groups: Open a saved group set');
        await choose('Morning');

        await waitForMembers('Work', ['Alpha', 'Beta']);
        await label('Play').waitForExist();
        await expect(label('Play')).toHaveElementClass('is-collapsed');
        expect(await groupCount()).toBe(2);
        expect((await tabs()).map(info => info.title)).toEqual(['Delta', 'Alpha', 'Beta', 'Gamma']);
    });

    it('asks for a name when the name is left empty, keeping the window open', async function () {
        await runCommand('Tab Groups: Save the current groups as a set');
        const input = $('.modal input[type="text"]');
        await input.waitForDisplayed();
        await browser.keys(Key.Enter);
        await browser.waitUntil(async () => (await $$('.notice').map(el => el.getText())).some(text => text.includes('Type a name for the set first.')), { timeoutMsg: 'no notice for an empty name' });
        await expect(input).toBeDisplayed();
        expect(await savedSets()).toEqual([]);

        // 그 창에서 이름을 적으면 저장됨
        await browser.keys('Trip');
        await browser.keys(Key.Enter);
        await browser.waitUntil(async () => (await savedSets()).map(set => set.name).join() === 'Trip', { timeoutMsg: 'the set was not saved' });
    });

    it('replaces a set saved with the same name', async function () {
        await saveSet('Morning');
        await saveSet('Morning');
        const sets = await savedSets();
        expect(sets.map(set => set.name)).toEqual(['Morning']);
        expect(sets[0]!.groups.map(group => group.name)).toEqual(['Work', 'Play']);
    });

    it('deletes a set', async function () {
        await saveSet('Morning');
        await runCommand('Tab Groups: Delete a saved group set');
        await choose('Morning');
        await browser.waitUntil(async () => (await savedSets()).length === 0, { timeoutMsg: 'the set was not deleted' });
    });

    it('follows a renamed note', async function () {
        await saveSet('Morning');
        await browser.executeObsidian(async ({ app }) => {
            const file = app.vault.getFileByPath('Alpha.md')!;
            await app.fileManager.renameFile(file, 'Alpha 2.md');
        });
        try {
            await browser.waitUntil(async () => (await savedSets())[0]!.groups[0]!.tabs.some(saved => saved.state?.file === 'Alpha 2.md'), {
                timeoutMsg: 'the set kept the old path',
            });
        } finally {
            await browser.executeObsidian(async ({ app }) => {
                const file = app.vault.getFileByPath('Alpha 2.md');
                if (file) await app.fileManager.renameFile(file, 'Alpha.md');
            });
        }
    });
});
