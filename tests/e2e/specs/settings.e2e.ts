import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, choose, createGroup, groupCount, label, resetWorkspace, runCommand, tab, tabs, waitForMembers, selectTab } from '../helpers';

// 💡 그룹 라벨에 보이는 탭 개수 (안 보이면 null)
async function labelCount(name: string): Promise<string | null> {
    const count = label(name).$('.tab-group-label-count');
    return (await count.isExisting()) ? count.getText() : null;
}

async function closeTab(title: string) {
    await selectTab(title);
    await browser.keys([Key.Ctrl, 'w']);
    await browser.waitUntil(async () => !(await tabs()).some(info => info.title === title));
}

// 💡 빠른 전환기(Ctrl+O)로 노트를 지금 탭에 엽니다.
async function quickOpen(name: string) {
    await browser.keys([Key.Ctrl, 'o']);
    await choose(name);
    await browser.waitUntil(async () => (await tabs()).some(info => info.title === name));
}

describe('settings', function () {
    describe('remove empty groups', function () {
        it('keeps a hidden group when off, so it can be reopened', async function () {
            await resetWorkspace(['Alpha', 'Beta']);
            await createGroup('Alpha', 'Work');
            await closeTab('Alpha');

            expect(await groupCount()).toBe(1);
            await runCommand('Tab Groups: Reopen a hidden group');
            await choose('Work');
            await label('Work').waitForExist();
            await waitForMembers('Work', ['Alpha']);
        });

        it('deletes the group with its last tab when on', async function () {
            await resetWorkspace(['Alpha', 'Beta'], { removeEmptyGroups: true });
            await createGroup('Alpha', 'Work');
            await closeTab('Alpha');

            await browser.waitUntil(async () => (await groupCount()) === 0, { timeoutMsg: 'the group was not removed' });
            await expect(label('Work')).not.toBeExisting();
        });
    });

    describe('tab count on group labels', function () {
        it('shows no count when off', async function () {
            await resetWorkspace(['Alpha', 'Beta', 'Gamma']);
            await createGroup('Alpha', 'Work');
            await addToGroup('Beta', 'Work');
            expect(await labelCount('Work')).toBeNull();
            await label('Work').click();
            await browser.waitUntil(async () => (await tab('Alpha')).hidden);
            expect(await labelCount('Work')).toBeNull();
        });

        it('shows the count only on collapsed groups', async function () {
            await resetWorkspace(['Alpha', 'Beta', 'Gamma'], { labelTabCount: 'collapsed' });
            await createGroup('Alpha', 'Work');
            await addToGroup('Beta', 'Work');
            expect(await labelCount('Work')).toBeNull();

            await selectTab('Gamma');
            await label('Work').click();
            await browser.waitUntil(async () => (await labelCount('Work')) === '2', { timeoutMsg: 'the collapsed group showed no count' });
        });

        it('shows the count on every group and follows its tabs', async function () {
            await resetWorkspace(['Alpha', 'Beta', 'Gamma'], { labelTabCount: 'all' });
            await createGroup('Alpha', 'Work');
            await browser.waitUntil(async () => (await labelCount('Work')) === '1');
            await addToGroup('Beta', 'Work');
            await browser.waitUntil(async () => (await labelCount('Work')) === '2', { timeoutMsg: 'the count did not follow the new tab' });
            // 💡 이름과 개수 사이 구분 점
            expect(await label('Work').$('.tab-group-label-text').getProperty('textContent')).toBe('Work·2');
        });
    });

    describe('suggest a name and color for new groups', function () {
        // 💡 지금 탭으로 새 그룹 창을 열어 미리 채워진 이름을 읽음
        async function suggestedName(title: string): Promise<string> {
            await selectTab(title);
            await runCommand('Tab Groups: Create tab group from the current tab');
            const input = $('.modal input[type="text"]');
            await input.waitForDisplayed();
            return input.getValue();
        }

        async function groupColor(name: string): Promise<string | undefined> {
            return browser.executeObsidian(({ plugins }, name) => {
                const groups = (plugins.tabGroups as unknown as { groups: Map<string, { name: string; color: string }> }).groups;
                return [...groups.values()].find(group => group.name === name)?.color;
            }, name);
        }

        it('leaves the name empty when off', async function () {
            await resetWorkspace(['Projects/Plan', 'Alpha']);
            expect(await suggestedName('Plan')).toBe('');
        });

        it("fills in the note's folder, with the same color for the same folder", async function () {
            await resetWorkspace(['Projects/Plan', 'Projects/Tasks', 'Alpha'], { suggestGroupName: true });
            expect(await suggestedName('Plan')).toBe('Projects');
            await browser.keys(Key.Enter);
            await label('Projects').waitForExist();
            const color = await groupColor('Projects');

            // 그룹을 풀고 같은 폴더의 다른 노트로 다시 만들면 같은 색
            await browser.executeObsidian(async ({ plugins }) => {
                const plugin = plugins.tabGroups as unknown as { groups: Map<string, unknown>; ungroupGroup(id: string): Promise<void> };
                for (const id of [...plugin.groups.keys()]) await plugin.ungroupGroup(id);
            });
            await label('Projects').waitForExist({ reverse: true });
            expect(await suggestedName('Tasks')).toBe('Projects');
            await browser.keys(Key.Enter);
            await label('Projects').waitForExist();
            expect(await groupColor('Projects')).toBe(color);
        });

        it('leaves the name empty for a note at the top of the vault', async function () {
            await resetWorkspace(['Alpha', 'Beta'], { suggestGroupName: true });
            expect(await suggestedName('Alpha')).toBe('');
        });
    });

    describe('lock grouped tabs', function () {
        it('replaces the note in the grouped tab when off', async function () {
            await resetWorkspace(['Alpha', 'Beta']);
            await createGroup('Alpha', 'Work');
            await selectTab('Alpha');
            await quickOpen('Delta');

            expect((await tabs()).map(info => info.title)).toEqual(['Delta', 'Beta']);
        });

        it('opens the note in a new tab and keeps the grouped tab when on', async function () {
            await resetWorkspace(['Alpha', 'Beta'], { lockGroupedTabs: true });
            await createGroup('Alpha', 'Work');
            await selectTab('Alpha');
            await quickOpen('Delta');

            const titles = (await tabs()).map(info => info.title);
            expect(titles).toContain('Alpha');
            expect(titles).toHaveLength(3);
            expect((await tab('Alpha')).group).not.toBeNull();
            expect((await tab('Delta')).group).toBeNull();
            await expect($('.workspace-split.mod-root .workspace-leaf.mod-active .inline-title')).toHaveText('Delta');
        });
    });
});
