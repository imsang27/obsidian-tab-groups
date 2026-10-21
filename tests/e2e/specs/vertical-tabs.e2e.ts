import { $, browser, expect } from '@wdio/globals';
import { addToGroup, clickButton, createGroup, label, resetWorkspace, tab, tabHeader } from '../helpers';

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

    it('opens the group window from the header menu', async function () {
        await header('Work').waitForExist();
        await header('Work').click({ button: 'right' });
        await $('.modal').waitForDisplayed();
        await clickButton('Ungroup');
        await browser.waitUntil(async () => !(await header('Work').isExisting()), { timeoutMsg: 'the header stayed after ungrouping' });
        await expect(row('Alpha')).not.toHaveElementClass('tab-group-vt-member');
    });
});
