import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { addToGroup, createGroup, label, members, resetWorkspace, tab, tabHeader, titles } from '../helpers';

// 💡 단축키로 탭을 한 칸씩 옮길 때 (Pane Relief 같은 플러그인). 옵시디언에는 탭 이동 명령이 없어서
// 테스트 전용 플러그인(tests/e2e/plugins/e2e-move-tab)의 Ctrl+Shift+PageUp/PageDown을 누릅니다.
async function moveActiveTab(title: string, key: 'PageUp' | 'PageDown') {
    await tabHeader(title).click();
    const before = (await titles()).join();
    const groupBefore = (await tab(title)).group;
    await browser.keys([Key.Ctrl, Key.Shift, key === 'PageUp' ? Key.PageUp : Key.PageDown]);
    await browser.waitUntil(async () => (await titles()).join() !== before || (await tab(title)).group !== groupBefore, {
        timeout: 3000,
        timeoutMsg: `${title} did not move`,
    });
}

// 시작: [Work] Alpha Beta | Gamma Delta
describe('moving tabs with hotkeys', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    it('joins an expanded group when moved into it, keeping its place', async function () {
        await moveActiveTab('Gamma', 'PageUp');

        expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
        expect(await members('Work')).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('leaves the group when moved past its edge, keeping its place', async function () {
        await moveActiveTab('Beta', 'PageDown');

        expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
        expect(await members('Work')).toEqual(['Alpha']);
    });

    it('moves within the group and stays in it', async function () {
        await moveActiveTab('Beta', 'PageUp');

        expect(await titles()).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
        expect(await members('Work')).toEqual(['Beta', 'Alpha']);
    });

    it('jumps over a collapsed group in one step', async function () {
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);
        await moveActiveTab('Gamma', 'PageUp');

        expect(await titles()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
        expect((await tab('Gamma')).group).toBeNull();
    });

    it('moves a one-tab group past a neighboring group as a block', async function () {
        await createGroup('Gamma', 'Solo');
        await moveActiveTab('Gamma', 'PageUp');

        expect(await titles()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
        expect(await members('Solo')).toEqual(['Gamma']);
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });
});
