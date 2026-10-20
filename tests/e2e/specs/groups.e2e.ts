import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, choose, clickButton, createGroup, groupCount, label, resetWorkspace, runCommand, tab, tabHeader, tabs, waitForMembers } from '../helpers';

describe('groups', function () {
    beforeEach(async function () {
        await resetWorkspace();
    });

    it('creates a group from the command palette', async function () {
        await createGroup('Alpha', 'Work');

        await expect(label('Work')).toBeDisplayed();
        expect((await tab('Alpha')).group).not.toBeNull();
        expect((await tab('Beta')).group).toBeNull();
        expect(await groupCount()).toBe(1);
    });

    it('adds the current tab to a group and keeps the group together', async function () {
        await createGroup('Alpha', 'Work');
        await tabHeader('Gamma').click();
        await runCommand('Tab Groups: Add the current tab to a group');
        await choose('Work');

        // 💡 그룹 탭들은 붙어 있어야 함 (Gamma가 Alpha 바로 뒤로 옮겨짐)
        await browser.waitUntil(async () => (await tab('Gamma')).group !== null);
        expect((await tabs()).map(info => info.title)).toEqual(['Alpha', 'Gamma', 'Beta', 'Delta']);
    });

    it('collapses and expands the group when its label is clicked', async function () {
        await createGroup('Alpha', 'Work');
        await tabHeader('Alpha').click();

        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        // 💡 접힌 그룹의 탭이 선택돼 있으면 옆의 보이는 탭으로 옮김
        expect((await tab('Beta')).active).toBe(true);

        await label('Work').click();
        await browser.waitUntil(async () => !(await tab('Alpha')).hidden);
        await expect(label('Work')).not.toHaveElementClass('is-collapsed');
    });

    // 💡 닫힌 탭 대신 옵시디언이 고르는 옆 탭이 접힌 그룹 안이면, 그룹을 펼치지 않고 보이는 탭으로 옮김
    it('keeps a collapsed group collapsed when the tab after it is closed', async function () {
        await createGroup('Beta', 'Work');
        await addToGroup('Gamma', 'Work');
        await tabHeader('Delta').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Beta')).hidden);

        await browser.keys([Key.Ctrl, 'w']);
        await browser.waitUntil(async () => !(await tabs()).some(info => info.title === 'Delta'));
        await browser.pause(300);

        await expect(label('Work')).toHaveElementClass('is-collapsed');
        expect((await tab('Beta')).hidden).toBe(true);
        expect((await tab('Gamma')).hidden).toBe(true);
        expect((await tab('Alpha')).active).toBe(true);
    });

    it('moves to the other side when the collapsed group comes after the closed tab', async function () {
        await createGroup('Gamma', 'Work');
        await addToGroup('Delta', 'Work');
        await tabHeader('Beta').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Gamma')).hidden);

        await browser.keys([Key.Ctrl, 'w']);
        await browser.waitUntil(async () => !(await tabs()).some(info => info.title === 'Beta'));
        await browser.pause(300);

        await expect(label('Work')).toHaveElementClass('is-collapsed');
        expect((await tab('Gamma')).hidden).toBe(true);
        expect((await tab('Alpha')).active).toBe(true);
    });

    it('expands the collapsed group when only its tabs are left', async function () {
        await resetWorkspace(['Alpha', 'Beta', 'Gamma']);
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await tabHeader('Gamma').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);

        await browser.keys([Key.Ctrl, 'w']);
        await browser.waitUntil(async () => !(await tabs()).some(info => info.title === 'Gamma'));

        await expect(label('Work')).not.toHaveElementClass('is-collapsed');
        await browser.waitUntil(async () => (await tabs()).every(info => !info.hidden), { timeoutMsg: 'the group stayed collapsed' });
        expect((await tabs()).some(info => info.active)).toBe(true);
    });

    it('creates a group from all ungrouped tabs', async function () {
        await createGroup('Alpha', 'Work');
        await tabHeader('Gamma').click();
        await runCommand('Tab Groups: Create tab group from all ungrouped tabs');
        const input = $('.modal input[type="text"]');
        await input.waitForDisplayed();
        await browser.keys('Rest');
        await browser.keys(Key.Enter);

        await waitForMembers('Rest', ['Beta', 'Gamma', 'Delta']);
        await waitForMembers('Work', ['Alpha']);
    });

    it('groups tabs by folder', async function () {
        await resetWorkspace(['Alpha', 'Projects/Plan', 'Beta', 'Projects/Tasks']);
        await runCommand('Tab Groups: Group tabs by folder');

        // 💡 폴더 이름이 그룹 이름 (보관함 맨 위의 노트는 보관함 이름의 그룹)
        await label('Projects').waitForExist({ timeoutMsg: 'no Projects group' });
        await waitForMembers('Projects', ['Plan', 'Tasks']);
        expect(await groupCount()).toBe(2);
        const vault = await browser.executeObsidian(({ app }) => app.vault.getName());
        await waitForMembers(vault, ['Alpha', 'Beta']);
    });

    it('does not group a folder with only one ungrouped tab', async function () {
        await resetWorkspace(['Alpha', 'Projects/Plan']);
        await runCommand('Tab Groups: Group tabs by folder');
        await $('.notice*=No folder has two or more ungrouped tabs').waitForExist({ timeoutMsg: 'no notice' });
        expect(await groupCount()).toBe(0);
    });

    it('opens a new tab at the end of the group from the group window', async function () {
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await label('Work').click({ button: 'right' });
        await clickButton('New tab in group');

        await waitForMembers('Work', ['Alpha', 'Beta', 'New tab']);
        expect((await tab('New tab')).active).toBe(true);
        expect((await tabs()).map(info => info.title)).toEqual(['Alpha', 'Beta', 'New tab', 'Gamma', 'Delta']);
    });

    it('opens a note in the new grouped tab even when grouped tabs are locked', async function () {
        await resetWorkspace(['Alpha', 'Beta'], { lockGroupedTabs: true });
        await createGroup('Alpha', 'Work');
        await runCommand("Tab Groups: Open a new tab in the current tab's group");
        await waitForMembers('Work', ['Alpha', 'New tab']);

        // 💡 옵시디언은 지금 탭이 빈 탭이면 새 탭 대신 그 탭을 씀: 빠른 전환기로 연 노트가 그 탭에 열려 그룹에 남음
        await browser.keys([Key.Ctrl, 'o']);
        await choose('Epsilon');
        await waitForMembers('Work', ['Alpha', 'Epsilon']);
        expect((await tabs()).map(info => info.title)).toEqual(['Alpha', 'Epsilon', 'Beta']);
    });

    it('removes the current tab from its group', async function () {
        await createGroup('Alpha', 'Work');
        await runCommand('Tab Groups: Remove the current tab from its group');

        await browser.waitUntil(async () => (await tab('Alpha')).group === null);
        await expect(label('Work')).not.toBeExisting();
    });

    it('renames a group from the label menu', async function () {
        await createGroup('Alpha', 'Work');
        await label('Work').click({ button: 'right' });

        const input = $('.modal input[type="text"]');
        await input.waitForDisplayed();
        await input.click();
        await browser.keys([Key.Ctrl, 'a']);
        await browser.keys('Personal');
        await clickButton('Save');

        await expect(label('Personal')).toBeDisplayed();
    });

    it('hides a group and reopens it with the same tabs', async function () {
        await createGroup('Alpha', 'Work');
        await tabHeader('Beta').click();
        await runCommand('Tab Groups: Add the current tab to a group');
        await choose('Work');
        await browser.waitUntil(async () => (await tab('Beta')).group !== null);

        await label('Work').click({ button: 'right' });
        await clickButton('Hide group');
        await browser.waitUntil(async () => (await tabs()).length === 2);
        expect((await tabs()).map(info => info.title)).toEqual(['Gamma', 'Delta']);
        await expect(label('Work')).not.toBeExisting();

        await runCommand('Tab Groups: Reopen a hidden group');
        await choose('Work');
        await label('Work').waitForExist();
        await waitForMembers('Work', ['Alpha', 'Beta']);
    });

    it('ungroups a group and keeps its tabs open', async function () {
        await createGroup('Alpha', 'Work');
        await label('Work').click({ button: 'right' });
        await clickButton('Ungroup');

        await expect(label('Work')).not.toBeExisting();
        expect((await tabs()).map(info => info.title)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
        expect(await groupCount()).toBe(0);
    });

    it('deletes a group and its tabs after confirming', async function () {
        await createGroup('Alpha', 'Work');
        await label('Work').click({ button: 'right' });
        await clickButton('Delete group');
        await clickButton('Delete');

        await browser.waitUntil(async () => (await tabs()).length === 3);
        expect((await tabs()).map(info => info.title)).toEqual(['Beta', 'Gamma', 'Delta']);
        expect(await groupCount()).toBe(0);
    });
});
