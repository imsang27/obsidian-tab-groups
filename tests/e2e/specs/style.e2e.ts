import { $, browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, resetWorkspace, tabHeader, selectTab } from '../helpers';

// 💡 그룹 탭 밑줄(::before)의 스타일 값
async function underline(title: string) {
    return browser.execute((title) => {
        const inner = document.querySelector(`.workspace-split.mod-root .workspace-tab-header[aria-label="${title}"] .workspace-tab-header-inner`);
        if (!inner) return null;
        const style = getComputedStyle(inner, '::before');
        return { content: style.content, marginLeft: style.marginLeft, marginRight: style.marginRight, right: style.right };
    }, title);
}

describe('group style', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    it('marks the tab just before the active tab', async function () {
        await selectTab('Gamma');
        await expect(tabHeader('Beta')).toHaveElementClass('tab-group-before-active');

        await selectTab('Delta');
        await expect(tabHeader('Gamma')).toHaveElementClass('tab-group-before-active');
        await expect(tabHeader('Beta')).not.toHaveElementClass('tab-group-before-active');
    });

    it('keeps the underline unbroken when a snippet adds margin to tabs', async function () {
        // 💡 탭 번호 스니펫처럼 같은 ::before에 여백을 주는 CSS (문서에 스타일시트를 잠시 붙임)
        await browser.execute(() => {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync('.workspace-tab-header .workspace-tab-header-inner::before { margin-right: 4px; margin-left: 4px; }');
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        });
        try {
            await selectTab('Delta');
            expect(await underline('Alpha')).toMatchObject({ content: '""', marginLeft: '0px', marginRight: '0px', right: '0px' });
        } finally {
            await browser.execute(() => { document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, -1); });
        }
    });

    it('switches to the classic style from the settings', async function () {
        await resetWorkspace(['Alpha', 'Beta'], { groupStyle: 'classic' });
        await expect($('body')).toHaveElementClass('tab-groups-style-classic');
    });
});
