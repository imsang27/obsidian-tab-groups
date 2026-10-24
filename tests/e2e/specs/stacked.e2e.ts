import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, createGroup, label, members, resetWorkspace, tab, tabHeader, titles } from '../helpers';

// 💡 쌓인 탭(Stacked tabs) 모드: 탭 머리가 화면 사이의 세로 막대가 됨
// 시작: [Work] Alpha Beta | Gamma Delta
describe('stacked tabs', function () {
    async function setStacked(on: boolean) {
        // 💡 켤 때는 지금 창만, 끌 때는 (분할로 늘어난 창까지) 모두
        await browser.executeObsidian(({ app }, on) => {
            type Tabs = { parent: { setStacked(on: boolean): void } };
            if (on) (app.workspace.getMostRecentLeaf(app.workspace.rootSplit) as unknown as Tabs).parent.setStacked(true);
            else app.workspace.iterateRootLeaves(leaf => { (leaf as unknown as Tabs).parent.setStacked(false); });
        }, on);
        await browser.waitUntil(async () => (await $('.workspace-split.mod-root .workspace-tabs.mod-stacked').isExisting()) === on);
        if (!on) return;
        // 💡 옵시디언이 막대 위치를 다 잡을 때까지 (라벨이 움직이는 중에 누르면 다른 곳이 눌림)
        let last = '';
        await browser.waitUntil(async () => {
            const now = await browser.execute(() => JSON.stringify(document.querySelector('.tab-group-stacked-label')?.getBoundingClientRect() ?? null));
            const stable = now !== 'null' && now === last;
            last = now;
            return stable;
        }, { interval: 100, timeoutMsg: 'the label kept moving' });
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

    // 💡 라벨을 막대 위로 끌어 놓기: 끌기 시작 → 놓을 막대 위(가로 비율 x) → 놓기 → 끌기 끝
    async function dragLabel(name: string, overTitle: string, x: number) {
        await browser.execute((label: HTMLElement, spine: HTMLElement, x: number) => {
            const dataTransfer = new DataTransfer();
            const r = spine.getBoundingClientRect();
            const at = { clientX: r.left + r.width * x, clientY: r.top + r.height / 2 };
            const fire = (el: HTMLElement, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, ...at }));
            fire(label, 'dragstart');
            fire(spine, 'dragenter');
            fire(spine, 'dragover');
            fire(spine, 'drop');
            fire(label, 'dragend');
        }, (await stackedLabel(name).getElement()) as unknown as HTMLElement, (await spine(overTitle).getElement()) as unknown as HTMLElement, x);
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

    it('moves the whole group when its label is dragged onto the spines', async function () {
        await setStacked(true);
        // 💡 Delta 막대 왼쪽 절반 → Gamma와 Delta 사이
        await dragLabel('Work', 'Delta', 0.25);
        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Alpha,Beta,Delta', { timeoutMsg: `titles: ${(await titles()).join()}` });
        expect((await members('Work')).join()).toBe('Alpha,Beta');

        // 💡 Delta 막대 오른쪽 절반 → 맨 끝 (라벨은 계속 그룹 첫 막대 맨 위)
        await dragLabel('Work', 'Delta', 0.75);
        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta,Alpha,Beta', { timeoutMsg: `titles: ${(await titles()).join()}` });
        expect((await members('Work')).join()).toBe('Alpha,Beta');
        await expect(spine('Alpha').$('.tab-group-stacked-label')).toBeExisting();
        await expect($('.tab-group-stacked-drop-before, .tab-group-stacked-drop-after')).not.toBeExisting();
    });

    it('moves a collapsed group as a whole and keeps it collapsed', async function () {
        await tabHeader('Gamma').click();
        await setStacked(true);
        await stackedLabel('Work').click();
        await browser.waitUntil(async () => !(await spine('Beta').isDisplayed()));

        await dragLabel('Work', 'Delta', 0.75);
        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta,Alpha,Beta', { timeoutMsg: `titles: ${(await titles()).join()}` });
        await expect(stackedLabel('Work')).toHaveElementClass('is-collapsed');
        await expect(spine('Beta')).not.toBeDisplayed();
    });

    // 💡 라벨을 쌓인 탭 화면 위에 놓기 (가로 x, 세로 y 비율)
    async function dropLabelOnPage(name: string, title: string, x: number, y: number) {
        const page = await browser.executeObsidian(({ app }, title) => {
            let el: HTMLElement | null = null;
            app.workspace.iterateAllLeaves(leaf => {
                if (leaf.getDisplayText() === title) el = (leaf as unknown as { containerEl: HTMLElement }).containerEl;
            });
            return el;
        }, title);
        await browser.execute((label: HTMLElement, page: HTMLElement, x: number, y: number) => {
            const dataTransfer = new DataTransfer();
            const r = page.getBoundingClientRect();
            const at = { clientX: r.left + r.width * x, clientY: r.top + r.height * y };
            const fire = (el: HTMLElement, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, ...at }));
            fire(label, 'dragstart');
            fire(page, 'dragover');
            fire(page, 'drop');
            fire(label, 'dragend');
        }, (await stackedLabel(name).getElement()) as unknown as HTMLElement, page as unknown as HTMLElement, x, y);
        await browser.pause(300);
    }

    const tabGroupCount = () => browser.executeObsidian(({ app }) => {
        const parents = new Set<unknown>();
        app.workspace.iterateRootLeaves(leaf => { parents.add((leaf as unknown as { parent: unknown }).parent); });
        return parents.size;
    });

    it('does not split left or right when the label is dropped on a page, like Obsidian', async function () {
        await setStacked(true);
        // 💡 화면 오른쪽 가장자리 → 옵시디언처럼 좌우 분할 없음
        await dropLabelOnPage('Work', 'Delta', 0.95, 0.5);
        expect(await tabGroupCount()).toBe(1);
        await expect($('.tab-group-split-preview')).not.toBeExisting();

        // 💡 아래쪽 가장자리 → 아래에 새 창 (옵시디언 분할처럼 일반 탭)
        await dropLabelOnPage('Work', 'Delta', 0.5, 0.95);
        await browser.waitUntil(async () => (await tabGroupCount()) === 2, { timeoutMsg: 'no split' });
        expect((await members('Work')).join()).toBe('Alpha,Beta');
    });

    // 💡 막대를 실제로 끌기: 끌기 시작 → 놓을 막대 왼쪽 가장자리 위(그 앞자리) → 드롭 선이 그룹 색인지 읽고 → 놓기 → 끌기 끝
    async function dragSpine(title: string, beforeTitle: string): Promise<boolean> {
        const inGroup = await browser.execute(async (source: HTMLElement, target: HTMLElement) => {
            const dataTransfer = new DataTransfer();
            const fire = (el: Element, type: string, at: Element = target) => {
                // 💡 끌기가 시작되면 막대 위치가 바뀔 수 있어 매번 다시 잼
                const r = at.getBoundingClientRect();
                el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, clientX: r.left + 3, clientY: r.top + 300 }));
            };
            // 옵시디언은 5px 넘게 움직여야 끌기로 봄 (시작은 끄는 막대 위에서)
            fire(source, 'dragstart', source);
            for (let i = 0; i < 4; i++) {
                fire(target, 'dragover');
                await new Promise(resolve => window.setTimeout(resolve, 30));
            }
            const inGroup = !!document.querySelector('.workspace-drop-overlay')?.classList.contains('tab-group-drop-in-group');
            fire(target, 'drop');
            fire(source, 'dragend');
            return inGroup;
        }, (await spine(title).getElement()) as unknown as HTMLElement, (await spine(beforeTitle).getElement()) as unknown as HTMLElement);
        await browser.pause(300);
        return inGroup;
    }

    it('shows in the group color when a dragged spine will join the group, like in the tab bar', async function () {
        await setStacked(true);
        // 💡 그룹 탭 둘 사이 → 그룹 색 드롭 선, 놓으면 편입
        expect(await dragSpine('Delta', 'Beta')).toBe(true);
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Delta,Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Alpha', 'Delta', 'Beta', 'Gamma']);
        await expect($('.tab-group-drop-in-group')).not.toBeExisting();
    });

    it('shows the plain drop line when a dragged spine will leave the group', async function () {
        await setStacked(true);
        // 💡 그룹 밖 탭 사이(Delta 앞) → 기본 드롭 선, 놓으면 이탈
        expect(await dragSpine('Alpha', 'Delta')).toBe(false);
        await browser.waitUntil(async () => (await members('Work')).join() === 'Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
    });
});
