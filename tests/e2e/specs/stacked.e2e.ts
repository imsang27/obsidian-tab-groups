import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, createGroup, label, members, resetWorkspace, tab, tabHeader, titles } from '../helpers';

// 💡 쌓인 탭(Stacked tabs) 모드: 탭 머리가 화면 사이의 세로 막대가 됨
// 시작: [Work] Alpha Beta | Gamma Delta
describe('stacked tabs', function () {
    async function setStacked(on: boolean) {
        await browser.executeObsidian(({ app }, on) => {
            const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit) as unknown as { parent: { setStacked(on: boolean): void } };
            leaf.parent.setStacked(on);
        }, on);
        await browser.waitUntil(async () => (await $('.workspace-split.mod-root .workspace-tabs.mod-stacked').isExisting()) === on);
    }

    // 💡 쌓인 탭의 막대 (탭 바가 아니라 화면 사이에 있음)
    const spine = (title: string) => $(`.workspace-split.mod-root .workspace-tab-container > .workspace-tab-header[aria-label="${title}"]`);
    const stackedLabel = (name: string) => $('.workspace-split.mod-root .workspace-tab-container').$(`.tab-group-stacked-label*=${name}`);
    const rect = async (el: ReturnType<typeof $>) => browser.execute((node: HTMLElement) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
    }, (await el.getElement()) as unknown as HTMLElement);

    // 💡 막대를 끌어 놓을 때와 같은 순서: 끌기 시작 → 옵시디언이 탭을 옮김(removeChild → insertChild) → 끌기 끝
    async function dragLikeObsidian(title: string, beforeTitle: string) {
        await browser.execute((el: HTMLElement) => {
            el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, composed: true, dataTransfer: new DataTransfer() }));
        }, (await spine(title).getElement()) as unknown as HTMLElement);
        await browser.executeObsidian(({ app }, title, beforeTitle) => {
            type Parent = { children: unknown[]; removeChild(leaf: unknown): void; insertChild(i: number, leaf: unknown): void; selectTabIndex(i: number): void };
            const find = (text: string) => {
                let found: { parent: Parent } | null = null;
                app.workspace.iterateAllLeaves(leaf => { if (leaf.getDisplayText() === text) found = leaf as never; });
                return found as unknown as { parent: Parent };
            };
            const source = find(title), target = find(beforeTitle);
            source.parent.removeChild(source);
            const index = target.parent.children.indexOf(target);
            target.parent.insertChild(index, source);
            target.parent.selectTabIndex(index);
        }, title, beforeTitle);
        await browser.execute(() => { window.dispatchEvent(new DragEvent('dragend', { bubbles: true })); });
        await browser.pause(300);
    }

    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    afterEach(async function () {
        while (await $('.modal-container').isExisting()) await browser.keys(Key.Escape);
        await setStacked(false);
    });

    it('marks the group on its spines with a label at the top of the first one', async function () {
        await setStacked(true);

        await stackedLabel('Work').waitForExist({ timeoutMsg: 'no label on the spines' });
        await expect(spine('Alpha').$('.tab-group-stacked-label')).toBeExisting();
        await expect(spine('Alpha')).toHaveElementClass('tab-group-member');
        await expect(spine('Beta')).toHaveElementClass('tab-group-member');
        await expect(spine('Gamma')).not.toHaveElementClass('tab-group-member');
        // 💡 라벨은 막대 맨 위 (탭 바에서 라벨이 맨 앞에 있듯이)
        expect((await rect(stackedLabel('Work'))).top - (await rect(spine('Alpha'))).top).toBeLessThan(20);
        // 위쪽 탭 바에 라벨이 남지 않음
        await expect(label('Work')).not.toBeExisting();
    });

    it('collapses the group to its label from the label, and expands it again', async function () {
        await tabHeader('Gamma').click();
        await setStacked(true);
        await stackedLabel('Work').click();

        // 💡 첫 막대(라벨)만 남고, 나머지 막대와 그룹 탭의 화면은 숨음
        await browser.waitUntil(async () => !(await spine('Beta').isDisplayed()), { timeoutMsg: 'the spines stayed' });
        await expect(spine('Alpha')).toBeDisplayed();
        await expect(stackedLabel('Work')).toHaveElementClass('is-collapsed');
        const pageShown = (title: string) => browser.executeObsidian(({ app }, title) => {
            let shown = false;
            app.workspace.iterateAllLeaves(leaf => {
                if (leaf.getDisplayText() === title) shown = (leaf as unknown as { containerEl: HTMLElement }).containerEl.isShown();
            });
            return shown;
        }, title);
        expect(await pageShown('Alpha')).toBe(false);
        expect(await pageShown('Beta')).toBe(false);
        // 다음 막대가 빈틈없이 붙음
        expect(Math.abs((await rect(spine('Gamma'))).left - (await rect(spine('Alpha'))).right)).toBeLessThan(2);

        await stackedLabel('Work').click();
        await browser.waitUntil(async () => spine('Beta').isDisplayed(), { timeoutMsg: 'the group did not expand' });
        await expect(stackedLabel('Work')).not.toHaveElementClass('is-collapsed');
        expect(await pageShown('Alpha')).toBe(true);
    });

    it('opens the group window from the label', async function () {
        await setStacked(true);
        await stackedLabel('Work').click({ button: 'right' });
        await $('.modal').$('button=Ungroup').waitForDisplayed({ timeoutMsg: 'no group window' });
    });

    it('stays collapsed through stacked mode and back to the tab bar', async function () {
        await tabHeader('Gamma').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);

        await setStacked(true);
        await stackedLabel('Work').waitForExist();
        await expect(stackedLabel('Work')).toHaveElementClass('is-collapsed');
        await browser.waitUntil(async () => !(await spine('Beta').isDisplayed()), { timeoutMsg: 'the group was not collapsed in stacked mode' });

        await setStacked(false);
        await label('Work').waitForExist({ timeoutMsg: 'the label did not come back' });
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        await browser.waitUntil(async () => (await tab('Alpha')).hidden && (await tab('Beta')).hidden, { timeoutMsg: 'the group did not stay collapsed' });
        await expect($('.tab-group-stacked-label')).not.toBeExisting();
    });

    it('joins the group when a spine is dragged between its tabs', async function () {
        await setStacked(true);
        await dragLikeObsidian('Gamma', 'Beta');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Gamma,Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Alpha', 'Gamma', 'Beta', 'Delta']);
    });

    it('leaves the group when a spine is dragged out of it, without snapping back', async function () {
        await setStacked(true);
        await dragLikeObsidian('Alpha', 'Delta');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
    });
});
