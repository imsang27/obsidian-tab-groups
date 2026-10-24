import { $, browser, expect } from '@wdio/globals';
import { addToGroup, clickButton, createGroup, label, members, resetWorkspace, runCommand, tab, tabHeader, titles } from '../helpers';

// 💡 Vertical Tabs 플러그인(꺼진 채 설치됨)을 켜고, 그 세로 탭 목록에 그룹이 보이는지 봅니다.
// 시작: [Work] Alpha Beta | Gamma Delta
describe('Vertical Tabs plugin', function () {
    async function setVerticalTabs(on: boolean) {
        await browser.executeObsidian(async ({ app }, on) => {
            const plugins = (app as unknown as { plugins: { enablePlugin(id: string): Promise<void>; disablePlugin(id: string): Promise<void> } }).plugins;
            if (on) await plugins.enablePlugin('vertical-tabs');
            else await plugins.disablePlugin('vertical-tabs');
        }, on);
    }

    const list = () => $('.workspace-leaf-content[data-type="vertical-tabs"]');
    // 💡 세로 목록의 탭 줄 (제목으로 찾음)
    const row = (title: string) => list().$(`//div[contains(concat(" ", @class, " "), " is-tab ")][./div[contains(@class, "tree-item-self")]//div[contains(@class, "tree-item-inner-text") and normalize-space()="${title}"]]`);
    const header = (name: string) => list().$(`.tab-group-vt-header*=${name}`);

    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await setVerticalTabs(true);
        await list().waitForExist({ timeoutMsg: 'the Vertical Tabs list did not open' });
    });

    afterEach(async function () {
        await setVerticalTabs(false);
        // 💡 끈 뒤 "최근 탭"이 사이드바 탭으로 남으면 다음 테스트가 첫 노트를 사이드바에 열어서, 편집 영역 탭을 고름
        await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getLeavesOfType('markdown').find(leaf => leaf.getRoot() === app.workspace.rootSplit);
            if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
        });
    });

    it('marks the group in the vertical list with a header before its first tab', async function () {
        await header('Work').waitForExist({ timeoutMsg: 'no group header in the list' });
        await expect(header('Work').$('.tab-group-vt-header-count')).toHaveText('2');
        await expect(row('Alpha')).toHaveElementClass('tab-group-vt-member');
        await expect(row('Beta')).toHaveElementClass('tab-group-vt-member');
        await expect(row('Gamma')).not.toHaveElementClass('tab-group-vt-member');
        // 머리줄은 그룹 첫 탭 바로 위
        const next = await browser.execute((el: HTMLElement) => el.nextElementSibling?.getAttribute('data-id') ?? null, (await header('Work').getElement()) as unknown as HTMLElement);
        const alphaId = await row('Alpha').getAttribute('data-id');
        expect(next).toBe(alphaId);
    });

    // 💡 그룹 표시 모양을 따름: 밑줄은 가는 색 줄만(배경 없음), 클래식은 굵은 색 줄과 옅은 배경
    it('follows the group style setting', async function () {
        await row('Alpha').waitForExist();
        const look = async () => browser.execute((el: HTMLElement) => {
            const style = getComputedStyle(el);
            return { background: style.backgroundColor, line: style.boxShadow };
        }, (await row('Alpha').getElement()) as unknown as HTMLElement);
        const setStyle = (style: string) => browser.executeObsidian(({ plugins }, style) => {
            const plugin = plugins.tabGroups as unknown as { settings: { groupStyle: string }; applyGroupStyle(): void };
            plugin.settings.groupStyle = style;
            plugin.applyGroupStyle();
        }, style);

        const underline = await look();
        expect(underline.background).toBe('rgba(0, 0, 0, 0)');
        expect(underline.line).toContain('2px 0px 0px 0px');

        await setStyle('classic');
        const classic = await look();
        expect(classic.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(classic.line).toContain('3px 0px 0px 0px');
        await setStyle('underline');
    });

    it('collapses and expands the group from its header, like the label', async function () {
        await tabHeader('Gamma').click();
        await header('Work').waitForExist();
        await header('Work').click();

        await browser.waitUntil(async () => (await tab('Alpha')).hidden, { timeoutMsg: 'the group did not collapse' });
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        await browser.waitUntil(async () => !(await row('Alpha').isDisplayed()) && !(await row('Beta').isDisplayed()), { timeoutMsg: 'the rows stayed visible' });
        await expect(header('Work')).toBeDisplayed();

        await header('Work').click();
        await browser.waitUntil(async () => !(await tab('Alpha')).hidden, { timeoutMsg: 'the group did not expand' });
        await browser.waitUntil(async () => row('Alpha').isDisplayed(), { timeoutMsg: 'the rows stayed hidden' });
    });

    it('follows changes made in the tab bar', async function () {
        await header('Work').waitForExist();
        await addToGroup('Gamma', 'Work');
        await browser.waitUntil(async () => (await header('Work').$('.tab-group-vt-header-count').getText()) === '3', { timeoutMsg: 'the count did not follow' });
        await expect(row('Gamma')).toHaveElementClass('tab-group-vt-member');
    });

    // 💡 Vertical Tabs 목록에서 끌어 옮길 때와 같은 호출 (그 플러그인의 moveTab: removeChild → insertChild → selectTabIndex)
    async function moveLikeVerticalTabs(title: string, beforeTitle: string) {
        await browser.executeObsidian(({ app }, title, beforeTitle) => {
            type Parent = { children: unknown[]; removeChild(leaf: unknown): void; insertChild(i: number, leaf: unknown): void; selectTabIndex(i: number): void };
            let source: { parent: Parent; setDimension(d: null): void } | null = null, target: { parent: Parent } | null = null;
            app.workspace.iterateAllLeaves(leaf => {
                if (leaf.getDisplayText() === title) source = leaf as never;
                if (leaf.getDisplayText() === beforeTitle) target = leaf as never;
            });
            const s = source as unknown as { parent: Parent; setDimension(d: null): void }, t = target as unknown as { parent: Parent };
            const sourceIndex = s.parent.children.indexOf(s), targetIndex = t.parent.children.indexOf(t);
            const insertIndex = s.parent === t.parent && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
            s.parent.removeChild(s);
            s.setDimension(null);
            t.parent.insertChild(insertIndex, s);
            t.parent.selectTabIndex(insertIndex);
            (app.workspace as unknown as { requestResize(): void }).requestResize();
        }, title, beforeTitle);
    }

    it('joins the group when a tab is moved between its tabs in the vertical list', async function () {
        await moveLikeVerticalTabs('Delta', 'Beta');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Delta,Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        await browser.waitUntil(async () => (await header('Work').$('.tab-group-vt-header-count').getText()) === '3', { timeoutMsg: 'the header count did not follow' });
    });

    it('leaves the group when a tab is moved out of it in the vertical list', async function () {
        await moveLikeVerticalTabs('Alpha', 'Delta');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
    });

    it('keeps the group together and settles when Vertical Tabs sorts tabs by title', async function () {
        // 💡 제목순(Alpha Beta Delta Gamma)이면 갈라지는 그룹: [Work] Alpha Gamma
        await tabHeader('Beta').click();
        await runCommand('Tab Groups: Remove the current tab from its group');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        await addToGroup('Gamma', 'Work');
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Gamma', { timeoutMsg: `Work: ${(await members('Work')).join()}, tabs: ${(await titles()).join()}` });
        try {
            await browser.executeObsidian(({ app }) => (app as unknown as { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById('vertical-tabs:sort-tabs-title-a-to-z'));
            // 💡 서로 다시 정렬하며 멈추지 않는지: 잠깐 뒤의 배치가 그 뒤로도 바뀌지 않아야 함
            await browser.pause(1500);
            const settled = (await titles()).join();
            process.stdout.write(`SORTED ${settled}
`);
            await browser.pause(1500);
            expect((await titles()).join()).toBe(settled);
            // 그룹 탭은 붙어 있음
            const order = await titles();
            const indexes = (await members('Work')).map(title => order.indexOf(title)).sort((a, b) => a - b);
            expect(indexes.length).toBe(2);
            expect(indexes[1]! - indexes[0]!).toBe(1);
        } finally {
            await browser.executeObsidian(({ app }) => (app as unknown as { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById('vertical-tabs:disable-tab-sorting'));
        }
    });

    it('follows "Close others" from the vertical list', async function () {
        // 💡 그 플러그인의 closeOthersInGroup: 탭 묶음의 children을 바로 바꾸고 onLayoutChange
        await browser.executeObsidian(({ app }) => {
            let alpha: { parent: { children: unknown[]; selectTab(leaf: unknown): void } } | null = null;
            app.workspace.iterateAllLeaves(leaf => { if (leaf.getDisplayText() === 'Alpha') alpha = leaf as never; });
            const leaf = alpha as unknown as { parent: { children: unknown[]; selectTab(leaf: unknown): void } };
            leaf.parent.children = [leaf];
            leaf.parent.selectTab(leaf);
            (app.workspace as unknown as { onLayoutChange(): void }).onLayoutChange();
        });
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        await browser.waitUntil(async () => (await header('Work').$('.tab-group-vt-header-count').getText()) === '1', { timeoutMsg: 'the header count did not follow' });
    });

    it('opens the group window from the header menu', async function () {
        await header('Work').waitForExist();
        await header('Work').click({ button: 'right' });
        await $('.modal').waitForDisplayed();
        await clickButton('Ungroup');
        await browser.waitUntil(async () => !(await header('Work').isExisting()), { timeoutMsg: 'the header stayed after ungrouping' });
        await expect(row('Alpha')).not.toHaveElementClass('tab-group-vt-member');
    });

    // 💡 세로 목록에서 실제 포인터로 탭 줄 끌기 (그 플러그인은 dnd-kit: 8px 넘게 움직여야 끌기 시작)
    // to: 놓을 줄(overTitle)의 자리에서 커서 y. 끄는 도중 빈 줄을 읽고 놓음
    async function dragRow(title: string, overTitle: string, to: (r: { top: number, middle: number, bottom: number }) => number) {
        const rectOf = (t: string) => browser.execute((t: string) => {
            const el = Array.from(document.querySelectorAll('.workspace-leaf-content[data-type="vertical-tabs"] .tree-item.is-tab'))
                .find(e => e.querySelector(':scope > .tree-item-self .tree-item-inner-text')?.textContent?.trim() === t)!;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + 60), top: r.top, middle: Math.round(r.top + r.height / 2), bottom: r.bottom };
        }, t);
        const source = await rectOf(title), target = await rectOf(overTitle);
        const y = Math.round(to(target));
        await browser.action('pointer')
            .move({ x: source.x, y: source.middle }).down()
            .move({ x: source.x, y: source.middle - 10, duration: 100 })
            .move({ x: source.x, y, duration: 300 }).pause(300)
            .perform(true);
        await browser.pause(150);
        const placeholder = await browser.execute(() => {
            const el = document.querySelector('.tab-group-vt-placeholder');
            return { shown: !!el?.isConnected, inGroup: !!el?.classList.contains('is-in-group') };
        });
        await browser.action('pointer').up().perform();
        await browser.pause(400);
        return placeholder;
    }

    it('shows a placeholder in the group color where a dragged row will join the group', async function () {
        await tabHeader('Delta').click();
        // 그룹 탭 둘 사이
        expect(await dragRow('Delta', 'Beta', r => r.middle)).toEqual({ shown: true, inGroup: true });
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Delta,Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Alpha', 'Delta', 'Beta', 'Gamma']);
        await expect($('.tab-group-vt-placeholder')).not.toBeExisting();
    });

    it('tells joining from leaving at the end of the group by the cursor', async function () {
        await tabHeader('Delta').click();
        // 다음 줄(Gamma) 위쪽 절반 → 그룹 맨 끝으로 편입
        expect(await dragRow('Delta', 'Gamma', r => r.top + 3)).toEqual({ shown: true, inGroup: true });
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Beta,Delta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });

        // 그룹 맨 끝 탭(Delta)을 다음 줄 아래쪽 절반으로 → 제자리에서 그룹 밖
        expect(await dragRow('Delta', 'Gamma', r => r.middle + 5)).toEqual({ shown: true, inGroup: false });
        await browser.waitUntil(async () => (await members('Work')).join() === 'Alpha,Beta', { timeoutMsg: `Work: ${(await members('Work')).join()}` });
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    });

    it('stays out of the group when a row is dropped on its header', async function () {
        await tabHeader('Delta').click();
        // 첫 탭(Alpha) 앞이지만 커서가 머리줄 위 → 빈 줄은 머리줄 앞, 그룹 밖
        expect(await dragRow('Delta', 'Alpha', r => r.top - 8)).toEqual({ shown: true, inGroup: false });
        await browser.waitUntil(async () => (await titles()).join() === 'Delta,Alpha,Beta,Gamma', { timeoutMsg: `titles: ${(await titles()).join()}` });
        expect((await members('Work')).join()).toBe('Alpha,Beta');
    });
});
