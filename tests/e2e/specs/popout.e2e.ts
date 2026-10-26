import { $, browser, expect } from '@wdio/globals';
import { addToGroup, clickButton, createGroup, dragTo, dragToWindow, label, members, moveToNewWindow, openNextTo, resetWorkspace, runCommand, tabHeader, titles, selectTab } from '../helpers';

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

    // 💡 새로 열린 창으로 옮긴 그룹을 확인하고 메인 창으로 돌아옴
    async function expectGroupInNewWindow() {
        await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2, { timeoutMsg: 'no new window' });
        const popout = (await browser.getWindowHandles()).find(handle => handle !== main)!;
        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta', { timeoutMsg: `main: ${(await titles()).join()}` });
        await browser.switchToWindow(popout);
        await browser.waitUntil(async () => (await titles()).join() === 'Alpha,Beta', { timeoutMsg: `new window: ${(await titles()).join()}` });
        await label('Work').waitForExist();
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await browser.switchToWindow(main);
    }

    it('moves a group to a new window from the group window', async function () {
        await label('Work').click({ button: 'right' });
        await clickButton('Move to new window');
        await expectGroupInNewWindow();
    });

    it('moves the current tab\'s group to a new window from the command palette', async function () {
        await selectTab('Beta');
        await runCommand("Tab Groups: Move the current tab's group to a new window");
        await expectGroupInNewWindow();
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

    // 💡 팝아웃 창의 쌓인 탭: 라벨이 막대 맨 위에 있고, 누르면 접히고, 끌면 그룹째 옮겨짐
    it('shows and controls groups in stacked tabs mode inside a pop-out window', async function () {
        const popout = await moveToNewWindow('Delta');
        await openNextTo('Delta', ['Epsilon', 'Gamma']);
        await browser.switchToWindow(popout);
        await createGroup('Delta', 'Pop');
        await addToGroup('Epsilon', 'Pop');
        await browser.waitUntil(async () => (await titles()).join() === 'Delta,Epsilon,Gamma');
        await selectTab('Gamma');

        await browser.executeObsidian(({ app }) => {
            app.workspace.iterateAllLeaves(leaf => {
                if (leaf.getDisplayText() === 'Delta') (leaf as unknown as { parent: { setStacked(on: boolean): void } }).parent.setStacked(true);
            });
        });
        const spine = (title: string) => $(`.workspace-tab-container > .workspace-tab-header[aria-label="${title}"]`);
        const stackedLabel = () => $('.workspace-tab-container .tab-group-stacked-label');
        await stackedLabel().waitForExist({ timeoutMsg: 'no label on the spines' });
        await expect(spine('Delta').$('.tab-group-stacked-label')).toBeExisting();

        await stackedLabel().click();
        await browser.waitUntil(async () => !(await spine('Epsilon').isDisplayed()), { timeoutMsg: 'the group did not collapse' });
        await stackedLabel().click();
        await browser.waitUntil(async () => spine('Epsilon').isDisplayed(), { timeoutMsg: 'the group did not expand' });

        await browser.execute((label: HTMLElement, target: HTMLElement) => {
            const dataTransfer = new DataTransfer();
            const r = target.getBoundingClientRect();
            const at = { clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2 };
            const fire = (el: HTMLElement, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, ...at }));
            fire(label, 'dragstart');
            fire(target, 'dragover');
            fire(target, 'drop');
            fire(label, 'dragend');
        }, (await stackedLabel().getElement()) as unknown as HTMLElement, (await spine('Gamma').getElement()) as unknown as HTMLElement);
        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta,Epsilon', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect(await members('Pop')).toEqual(['Delta', 'Epsilon']);
    });
});
