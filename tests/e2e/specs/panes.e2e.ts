import { browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, dragTo, label, members, openInSplit, paneContent, panes, resetWorkspace, tab, tabHeader } from '../helpers';

// 💡 옵시디언은 탭 헤더를 조금 뒤에 옮기므로, 창마다 탭이 기대한 대로 놓일 때까지 기다립니다.
async function waitForPanes(expected: string[][]) {
    await browser.waitUntil(async () => JSON.stringify(await panes()) === JSON.stringify(expected), {
        timeout: 3000,
        timeoutMsg: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(await panes())}`,
    });
}

// 💡 다른 창(분할 화면)으로 탭과 그룹을 끌어다 놓습니다.
// 시작: 왼쪽 창 [Work] Alpha Beta | Gamma Delta, 오른쪽 창 Epsilon
describe('dragging between panes', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await openInSplit('Epsilon');
        expect(await panes()).toEqual([['Alpha', 'Beta', 'Gamma', 'Delta'], ['Epsilon']]);
    });

    it('moves a tab to the other pane', async function () {
        await dragTo(tabHeader('Gamma'), tabHeader('Epsilon'), 0.9);

        await waitForPanes([['Alpha', 'Beta', 'Delta'], ['Epsilon', 'Gamma']]);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });

    it('takes a grouped tab out of its group when moved to the other pane, like Chrome', async function () {
        await dragTo(tabHeader('Beta'), tabHeader('Epsilon'), 0.9);

        await waitForPanes([['Alpha', 'Gamma', 'Delta'], ['Epsilon', 'Beta']]);
        await browser.waitUntil(async () => (await tab('Beta')).group === null, { timeoutMsg: 'Beta stayed in the group' });
        expect(await members('Work')).toEqual(['Alpha']);
    });

    it('moves the whole group when its label is dropped on the other pane\'s tab bar', async function () {
        await dragTo(label('Work'), tabHeader('Epsilon'), 0.9);

        await waitForPanes([['Gamma', 'Delta'], ['Epsilon', 'Alpha', 'Beta']]);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await expect(label('Work')).toBeDisplayed();
    });

    it('merges the group into the other pane when its label is dropped in the middle of that pane', async function () {
        await dragTo(label('Work'), paneContent(1), 0.5);

        await waitForPanes([['Gamma', 'Delta'], ['Epsilon', 'Alpha', 'Beta']]);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });

    it('splits the view when its label is dropped near the edge of a pane', async function () {
        // 💡 왼쪽 창 편집 화면의 오른쪽 가장자리(25% 안) → 그 창 오른쪽에 새 창
        await dragTo(label('Work'), paneContent(0), 0.9);

        await waitForPanes([['Gamma', 'Delta'], ['Alpha', 'Beta'], ['Epsilon']]);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await expect(label('Work')).toBeDisplayed();
    });
});
