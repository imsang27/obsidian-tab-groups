import { browser, expect } from '@wdio/globals';
import { addToGroup, cancelDrag, createGroup, dragOver, dragTo, label, members, resetWorkspace, startDrag, tab, tabHeader, titles } from '../helpers';

// 💡 끄는 동안의 자리 표시: 놓으면 들어갈 그룹이 있으면 그 그룹 색 (없으면 null)
async function placeholderGroupColor(): Promise<string | null> {
    return browser.execute(() => {
        const el = document.querySelector<HTMLElement>('.tab-group-drag-placeholder');
        return el?.classList.contains('is-in-group') ? el.style.getPropertyValue('--tab-group-color') : null;
    });
}

// 💡 자리 표시가 그룹의 처음·끝인지, 맞닿아 모서리를 평평하게 한 그룹 탭은 무엇인지 (클래식 모양에서 한 덩어리로 보이게)
async function placeholderJoin(): Promise<{ first: boolean; last: boolean; joined: string[] }> {
    return browser.execute(() => {
        const el = document.querySelector('.tab-group-drag-placeholder');
        const joined = Array.from(document.querySelectorAll('.tab-group-joined-right, .tab-group-joined-left'))
            .map(header => `${header.getAttribute('aria-label')}:${header.classList.contains('tab-group-joined-right') ? 'right' : 'left'}`);
        return { first: !!el?.classList.contains('is-group-first'), last: !!el?.classList.contains('is-group-last'), joined };
    });
}

async function groupColor(name: string): Promise<string> {
    return browser.executeObsidian(({ plugins }, name) => {
        const groups = (plugins.tabGroups as unknown as { groups: Map<string, { name: string; color: string }> }).groups;
        return [...groups.values()].find(group => group.name === name)!.color;
    }, name);
}

// 💡 실제 마우스로 탭과 그룹 라벨을 끌어다 놓습니다.
// 시작: [Work] Alpha Beta | Gamma Delta
describe('drag', function () {
    beforeEach(async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
    });

    it('joins a group when a tab is dropped between its tabs', async function () {
        await dragTo(tabHeader('Delta'), tabHeader('Beta'), 0.2);

        await browser.waitUntil(async () => (await members('Work')).length === 3, { timeoutMsg: 'Delta did not join the group' });
        expect(await titles()).toEqual(['Alpha', 'Delta', 'Beta', 'Gamma']);
        expect(await members('Work')).toEqual(['Alpha', 'Delta', 'Beta']);
    });

    it('joins a group at its end when dropped over the last tab, like Chrome', async function () {
        // 💡 그룹 마지막 탭의 오른쪽 절반 = 그룹 안쪽 끝
        await dragTo(tabHeader('Delta'), tabHeader('Beta'), 0.8);

        await browser.waitUntil(async () => (await members('Work')).length === 3, { timeoutMsg: 'Delta did not join the group' });
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    });

    it('shows on the placeholder whether the tab will join the group', async function () {
        const color = await groupColor('Work');
        await startDrag(tabHeader('Delta'));
        try {
            // 그룹 마지막 탭의 오른쪽 절반: 그룹 끝에 들어감
            await dragOver(tabHeader('Beta'), 0.8);
            expect(await placeholderGroupColor()).toBe(color);
            expect(await placeholderJoin()).toEqual({ first: false, last: true, joined: ['Beta:right'] });
            // 그 오른쪽(다음 탭 왼쪽 절반): 그룹 밖
            await dragOver(tabHeader('Gamma'), 0.2);
            expect(await placeholderGroupColor()).toBeNull();
            expect(await placeholderJoin()).toEqual({ first: false, last: false, joined: [] });
            // 그룹 탭 사이: 들어감
            await dragOver(tabHeader('Beta'), 0.2);
            expect(await placeholderGroupColor()).toBe(color);
            expect(await placeholderJoin()).toEqual({ first: false, last: false, joined: ['Alpha:right', 'Beta:left'] });
        } finally {
            await cancelDrag();
        }
        expect((await placeholderJoin()).joined).toEqual([]);
        // 💡 끝내면 그대로 (취소한 끌기는 아무것도 바꾸지 않음)
        expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    });

    it('leaves the group when a grouped tab is dropped outside it', async function () {
        await dragTo(tabHeader('Alpha'), tabHeader('Delta'), 0.8);

        await browser.waitUntil(async () => (await tab('Alpha')).group === null, { timeoutMsg: 'Alpha stayed in the group' });
        expect(await titles()).toEqual(['Beta', 'Gamma', 'Delta', 'Alpha']);
        expect(await members('Work')).toEqual(['Beta']);
    });

    it('does not join a collapsed group', async function () {
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);
        // 💡 접힌 라벨 바로 뒤(Gamma 왼쪽)에 놓음
        await dragTo(tabHeader('Delta'), tabHeader('Gamma'), 0.2);

        await browser.waitUntil(async () => (await titles()).join() === 'Alpha,Beta,Delta,Gamma', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect((await tab('Delta')).group).toBeNull();
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
    });

    it('moves the whole group when its label is dragged', async function () {
        await dragTo(label('Work'), tabHeader('Delta'), 0.9);

        await browser.waitUntil(async () => (await titles()).join() === 'Gamma,Delta,Alpha,Beta', { timeoutMsg: `order: ${(await titles()).join()}` });
        expect(await members('Work')).toEqual(['Alpha', 'Beta']);
        await expect(label('Work')).toBeDisplayed();
    });
});
