import { browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, dragTo, dragToWindow, label, members, moveToNewWindow, openNextTo, resetWorkspace, tabHeader, titles } from '../helpers';

// 💡 팝아웃 창(옵시디언의 "새 창으로 옮기기"로 연 별도 창)에서도 그룹이 똑같이 동작하는지
// 시작: 메인 창 [Work] Alpha Beta | Gamma Delta
describe('pop-out windows', function () {
    let main: string;

    beforeEach(async function () {
        await resetWorkspace();
        main = await browser.getWindowHandle();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    it('takes a grouped tab out of its group when it moves to a new window, like Chrome', async function () {
        const popout = await moveToNewWindow('Beta');

        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        await browser.switchToWindow(popout);
        expect(await titles()).toEqual(['Beta']);
        expect(await members('Work')).toEqual([]);
    });

    it('groups tabs inside a pop-out window', async function () {
        const popout = await moveToNewWindow('Delta');
        await openNextTo('Delta', ['Epsilon', 'Gamma']);
        await browser.switchToWindow(popout);
        await browser.waitUntil(async () => (await titles()).join() === 'Delta,Epsilon,Gamma');

        await createGroup('Delta', 'Pop');
        // 💡 그룹 마지막 탭의 오른쪽 절반 = 그룹 안쪽 끝
        await dragTo(tabHeader('Gamma'), tabHeader('Delta'), 0.8);

        await browser.waitUntil(async () => (await members('Pop')).length === 2, { timeoutMsg: `Pop: ${(await members('Pop')).join()}` });
        expect(await titles()).toEqual(['Delta', 'Gamma', 'Epsilon']);
        expect(await members('Pop')).toEqual(['Delta', 'Gamma']);
    });

    it('moves a group by its label inside a pop-out window', async function () {
        const popout = await moveToNewWindow('Delta');
        await openNextTo('Delta', ['Epsilon']);
        await browser.switchToWindow(popout);
        await createGroup('Delta', 'Pop');

        await dragTo(label('Pop'), tabHeader('Epsilon'), 0.9);

        await browser.waitUntil(async () => (await titles()).join() === 'Epsilon,Delta', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect(await members('Pop')).toEqual(['Delta']);
    });

    it('moves a tab from the main window to a pop-out window', async function () {
        const popout = await moveToNewWindow('Delta');

        await dragToWindow('.workspace-tab-header[aria-label="Gamma"]', popout, '.workspace-tab-header[aria-label="Delta"]', 0.9);

        await browser.switchToWindow(popout);
        await browser.waitUntil(async () => (await titles()).join() === 'Delta,Gamma', { timeoutMsg: `pop-out: ${(await titles()).join()}` });
        await browser.switchToWindow(main);
        expect(await titles()).toEqual(['Alpha', 'Beta']);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });

    it('moves a whole group to a pop-out window by its label', async function () {
        const popout = await moveToNewWindow('Delta');

        await dragToWindow('.tab-group-label', popout, '.workspace-tab-header[aria-label="Delta"]', 0.9);

        await browser.switchToWindow(popout);
        await browser.waitUntil(async () => (await titles()).join() === 'Delta,Alpha,Beta', { timeoutMsg: `pop-out: ${(await titles()).join()}` });
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await expect(label('Work')).toBeDisplayed();
        await browser.switchToWindow(main);
        expect(await titles()).toEqual(['Gamma']);
    });
});
