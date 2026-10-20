import { $, browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, label, resetWorkspace, tab, tabHeader } from '../helpers';

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

    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    afterEach(async function () {
        await setStacked(false);
    });

    it('marks the group on its spines and shows its name on the first one', async function () {
        await setStacked(true);

        await browser.waitUntil(async () => (await spine('Alpha').$('.workspace-tab-header-inner').getAttribute('data-tab-group-name')) === 'Work', {
            timeoutMsg: 'the first spine has no group name',
        });
        await expect(spine('Alpha')).toHaveElementClass('tab-group-member');
        await expect(spine('Beta')).toHaveElementClass('tab-group-member');
        await expect(spine('Gamma')).not.toHaveElementClass('tab-group-member');
        // 💡 위쪽 탭 바에 라벨이 남지 않음
        await expect(label('Work')).not.toBeExisting();
    });

    it('keeps the spines of a collapsed group, and collapses it again in the normal tab bar', async function () {
        await tabHeader('Gamma').click();
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);

        await setStacked(true);
        await browser.waitUntil(async () => (await spine('Alpha').isDisplayed()) && (await spine('Beta').isDisplayed()), { timeoutMsg: 'the spines were hidden' });

        await setStacked(false);
        await label('Work').waitForExist({ timeoutMsg: 'the label did not come back' });
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        await browser.waitUntil(async () => (await tab('Alpha')).hidden && (await tab('Beta')).hidden, { timeoutMsg: 'the group did not collapse again' });
    });
});
