import { browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, dragTo, label, members, resetWorkspace, tab, tabHeader, titles } from '../helpers';

// 💡 실제 마우스로 탭과 그룹 라벨을 끌어다 놓습니다.
// 시작: [Work] Alpha Beta | Gamma Delta
describe('drag', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    it('joins a group when a tab is dropped between its tabs', async function () {
        await dragTo(tabHeader('Delta'), tabHeader('Beta'), 0.2);

        await browser.waitUntil(async () => (await members('Work')).length === 3, { timeoutMsg: 'Delta did not join the group' });
        expect(await titles()).toEqual(['Alpha', 'Delta', 'Beta', 'Gamma']);
        expect(await members('Work')).toEqual(['Alpha', 'Delta', 'Beta']);
    });

    it('joins a group at its end when dropped over the last tab, like Chrome', async function () {
        // 💡 그룹 마지막 탭의 오른쪽 절반 = 그룹 안쪽 끝
        await dragTo(tabHeader('Delta'), tabHeader('Beta'), 0.8);

        await browser.waitUntil(async () => (await members('Work')).length === 3, { timeoutMsg: 'Delta did not join the group' });
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    });

    it('leaves the group when a grouped tab is dropped outside it', async function () {
        await dragTo(tabHeader('Alpha'), tabHeader('Delta'), 0.8);

        await browser.waitUntil(async () => (await tab('Alpha')).group === null, { timeoutMsg: 'Alpha stayed in the group' });
        expect(await titles()).toEqual(['Beta', 'Gamma', 'Delta', 'Alpha']);
        expect(await members('Work')).toEqual(['Beta']);
    });

    it('does not join a collapsed group', async function () {
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);
        // 💡 접힌 라벨 바로 뒤(Gamma 왼쪽)에 놓음
        await dragTo(tabHeader('Delta'), tabHeader('Gamma'), 0.2);

        await browser.waitUntil(async () => (await titles()).join() === 'Alpha,Beta,Delta,Gamma', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect((await tab('Delta')).group).toBeNull();
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });

    it('moves the whole group when its label is dragged', async function () {
        await dragTo(label('Work'), tabHeader('Delta'), 0.9);

        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta,Alpha,Beta', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await expect(label('Work')).toBeDisplayed();
    });
});
