import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { choose, createGroup, groupCount, label, resetWorkspace, runCommand, tab, tabHeader, tabs, waitForMembers } from '../helpers';

async function closeTab(title: string) {
    await tabHeader(title).click();
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

    describe('lock grouped tabs', function () {
        it('replaces the note in the grouped tab when off', async function () {
            await resetWorkspace(['Alpha', 'Beta']);
            await createGroup('Alpha', 'Work');
            await tabHeader('Alpha').click();
            await quickOpen('Delta');

            expect((await tabs()).map(info => info.title)).toEqual(['Delta', 'Beta']);
        });

        it('opens the note in a new tab and keeps the grouped tab when on', async function () {
            await resetWorkspace(['Alpha', 'Beta'], { lockGroupedTabs: true });
            await createGroup('Alpha', 'Work');
            await tabHeader('Alpha').click();
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
