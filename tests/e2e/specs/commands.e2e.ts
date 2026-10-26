import { browser, expect } from '@wdio/globals';
import { addToGroup, choose, createGroup, label, resetWorkspace, runCommand, tab, tabs, selectTab } from '../helpers';

// 💡 명령 팔레트로 그룹 여러 개를 다루는 명령들
// 시작: [Work] Alpha Beta | [Play] Gamma | Delta
describe('commands', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await createGroup('Gamma', 'Play');
        await selectTab('Delta');
    });

    async function active(): Promise<string | undefined> {
        return (await tabs()).find(info => info.active)?.title;
    }

    it('collapses and expands all groups', async function () {
        await runCommand('Tab Groups: Collapse all groups');
        await browser.waitUntil(async () => (await tab('Alpha')).hidden && (await tab('Gamma')).hidden, { timeoutMsg: 'not every group collapsed' });
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        await expect(label('Play')).toHaveElementClass('is-collapsed');
        expect(await active()).toBe('Delta');

        await runCommand('Tab Groups: Expand all groups');
        await browser.waitUntil(async () => (await tabs()).every(info => !info.hidden), { timeoutMsg: 'not every group expanded' });
        await expect(label('Work')).not.toHaveElementClass('is-collapsed');
        await expect(label('Play')).not.toHaveElementClass('is-collapsed');
    });

    it('goes to the next and the previous group, wrapping around', async function () {
        // Delta 뒤에는 그룹이 없으니 맨 앞 그룹으로
        await runCommand('Tab Groups: Go to the next group');
        await browser.waitUntil(async () => (await active()) === 'Alpha', { timeoutMsg: 'did not go to Work' });
        await runCommand('Tab Groups: Go to the next group');
        await browser.waitUntil(async () => (await active()) === 'Gamma', { timeoutMsg: 'did not go to Play' });
        await runCommand('Tab Groups: Go to the previous group');
        await browser.waitUntil(async () => (await active()) === 'Alpha', { timeoutMsg: 'did not go back to Work' });
        // 맨 앞에서 이전으로 가면 맨 뒤 그룹으로
        await runCommand('Tab Groups: Go to the previous group');
        await browser.waitUntil(async () => (await active()) === 'Gamma', { timeoutMsg: 'did not wrap to Play' });
    });

    it('expands a collapsed group when going to it', async function () {
        await label('Play').click();
        await browser.waitUntil(async () => (await tab('Gamma')).hidden);
        await selectTab('Alpha');

        await runCommand('Tab Groups: Go to the next group');
        await browser.waitUntil(async () => (await active()) === 'Gamma', { timeoutMsg: 'did not go to Play' });
        await expect(label('Play')).not.toHaveElementClass('is-collapsed');
        expect((await tab('Gamma')).hidden).toBe(false);
    });

    it("hides the current tab's group", async function () {
        await selectTab('Beta');
        await runCommand("Tab Groups: Hide the current tab's group");

        await browser.waitUntil(async () => !(await tabs()).some(info => info.title === 'Alpha' || info.title === 'Beta'), { timeoutMsg: 'the group was not hidden' });
        await expect(label('Work')).not.toBeExisting();
        // 💡 숨긴 그룹은 다시 열 수 있음
        await runCommand('Tab Groups: Reopen a hidden group');
        await choose('Work');
        await browser.waitUntil(async () => (await tabs()).some(info => info.title === 'Alpha'), { timeoutMsg: 'the hidden group did not reopen' });
    });
});
