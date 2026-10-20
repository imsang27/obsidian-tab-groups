import { $, $$, browser } from '@wdio/globals';
import { Key } from 'webdriverio';

// 💡 E2E 테스트가 같이 쓰는 동작: 탭과 그룹을 처음 상태로 돌리고, 사람처럼 클릭·입력합니다.

export const NOTES = ['Alpha', 'Beta', 'Gamma', 'Delta'];

// 💡 테스트에서 건드리는 플러그인 부분 (실제 객체는 옵시디언 안에 있음)
interface TabGroupsPlugin {
    groups: Map<string, unknown>;
    settings: Record<string, unknown>;
    applyGroupStyle(): void;
    saveSettings(): Promise<void>;
}

export interface TabInfo {
    title: string;
    group: string | null;
    hidden: boolean;
    active: boolean;
}

// 💡 열린 창을 닫고, 탭을 모두 닫고 그룹을 지운 뒤, 설정을 기본값(+ 바꿀 값)으로 돌리고 노트들을 차례로 엽니다.
export async function resetWorkspace(notes: string[] = NOTES, settings: Record<string, unknown> = {}) {
    while (await $('.modal-container').isExisting()) {
        await browser.keys(Key.Escape);
        await browser.pause(100);
    }
    await browser.executeObsidian(async ({ app, plugins }, notes, settings) => {
        const plugin = plugins.tabGroups as unknown as TabGroupsPlugin;
        const leaves: { detach(): void }[] = [];
        app.workspace.iterateRootLeaves(leaf => { leaves.push(leaf); });
        leaves.forEach(leaf => leaf.detach());
        plugin.groups.clear();
        Object.assign(plugin.settings, { groupStyle: 'underline', removeEmptyGroups: false, lockGroupedTabs: false }, settings);
        plugin.applyGroupStyle();
        await plugin.saveSettings();
        for (const [i, name] of notes.entries()) {
            const file = app.vault.getFileByPath(`${name}.md`);
            if (file) await app.workspace.getLeaf(i === 0 ? false : 'tab').openFile(file);
        }
    }, notes, settings);
    await browser.waitUntil(async () => (await tabs()).map(tab => tab.title).join() === notes.join(), {
        timeoutMsg: `tabs didn't open: ${notes.join(', ')}`,
    });
}

// 💡 편집 영역의 탭 순서와 상태 (접힌 그룹의 탭도 포함)
export async function tabs(): Promise<TabInfo[]> {
    return browser.execute(() => Array.from(document.querySelectorAll('.workspace-split.mod-root .workspace-tab-header')).map(el => ({
        title: el.querySelector('.workspace-tab-header-inner-title')?.textContent ?? '',
        group: el.getAttribute('data-tab-group-id'),
        hidden: el.classList.contains('tab-group-hidden'),
        active: el.classList.contains('is-active'),
    })));
}

export async function tab(title: string): Promise<TabInfo> {
    const found = (await tabs()).find(info => info.title === title);
    if (!found) throw new Error(`No tab named ${title}`);
    return found;
}

export function tabHeader(title: string) {
    return $(`.workspace-split.mod-root .workspace-tab-header[aria-label="${title}"]`);
}

export function label(name: string) {
    return $(`.tab-group-label*=${name}`);
}

export async function groupCount(): Promise<number> {
    return browser.executeObsidian(({ plugins }) => (plugins.tabGroups as unknown as TabGroupsPlugin).groups.size);
}

// 💡 명령 팔레트를 열어 이름으로 찾아 실행합니다. (단축키로 여는 것과 같음)
export async function runCommand(name: string) {
    await browser.keys([Key.Ctrl, 'p']);
    const input = $('.prompt-input');
    await input.waitForDisplayed();
    await input.setValue(name);
    await $('.suggestion-item.is-selected').waitForDisplayed();
    await browser.keys(Key.Enter);
}

// 💡 탭을 클릭해 고른 뒤 명령으로 그룹을 만들고, 창에 이름을 입력합니다.
export async function createGroup(title: string, name: string) {
    await tabHeader(title).click();
    await runCommand('Tab Groups: Create tab group from the current tab');
    const input = $('.modal input[type="text"]');
    await input.waitForDisplayed();
    await browser.keys(name);
    await browser.keys(Key.Enter);
    await label(name).waitForExist();
}

// 💡 탭을 고른 뒤 명령으로 지금 있는 그룹에 넣습니다.
export async function addToGroup(title: string, name: string) {
    await tabHeader(title).click();
    await runCommand('Tab Groups: Add the current tab to a group');
    await choose(name);
    await browser.waitUntil(async () => (await tab(title)).group !== null);
}

// 💡 고르기 창(그룹 고르기 등)에서 항목을 입력해 고릅니다.
export async function choose(text: string) {
    const input = $('.prompt-input');
    await input.waitForDisplayed();
    await input.setValue(text);
    await $('.suggestion-item.is-selected').waitForDisplayed();
    await browser.keys(Key.Enter);
}

export async function clickButton(text: string) {
    await $('.modal').$(`button=${text}`).click();
}

type WdioElement = ReturnType<typeof $>;

// 💡 탭이나 라벨을 끌어다 target 요소 너비의 at 비율 지점(0 = 왼쪽 끝, 1 = 오른쪽 끝)에 놓습니다.
// 🚨 ChromeDriver는 HTML5 드래그 중 dragover를 첫 한 번만 보내고 그 뒤 마우스 이동은 전달하지 않아,
// 실제 마우스 동작으로는 놓을 자리가 따라오지 않습니다. 그래서 사람이 끌 때와 같은 순서·좌표로
// 드래그 이벤트(dragstart → dragover 여러 번 → drop → dragend)를 페이지 안에서 보냅니다.
// 끌기 시작하면 끄는 탭이 숨고 자리 표시가 생겨 다른 탭 자리가 바뀝니다. 놓을 지점은 그 뒤에,
// 플러그인이 자리를 정할 때와 같은 기준(자리 표시를 뺀 배치, tab-drag.ts의 is-measuring)으로 잽니다.
export async function dragTo(source: WdioElement, target: WdioElement, at: number) {
    await browser.execute(async (sourceEl: HTMLElement, targetEl: HTMLElement, at: number) => {
        const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
        const dataTransfer = new DataTransfer();
        const fire = (type: string, el: Element, x: number, y: number) => el.dispatchEvent(new DragEvent(type, {
            bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer,
        }));

        const s = sourceEl.getBoundingClientRect();
        const start = { x: s.left + s.width / 2, y: s.top + s.height / 2 };
        fire('dragstart', sourceEl, start.x, start.y);
        fire('dragover', sourceEl, start.x, start.y);
        await wait(50);

        const placeholder = document.querySelector('.tab-group-drag-placeholder');
        placeholder?.classList.add('is-measuring');
        const r = targetEl.getBoundingClientRect();
        placeholder?.classList.remove('is-measuring');
        const end = { x: r.left + r.width * at, y: r.top + r.height / 2 };

        // 사이를 몇 걸음에 나눠 지나가며, 그때마다 커서 아래 요소에 dragover
        let under: Element = sourceEl;
        for (let i = 1; i <= 5; i++) {
            const x = start.x + (end.x - start.x) * i / 5;
            under = document.elementFromPoint(x, end.y) ?? under;
            fire('dragover', under, x, end.y);
            await wait(30);
        }
        fire('drop', under, end.x, end.y);
        fire('dragend', sourceEl, end.x, end.y);
    }, (await source.getElement()) as unknown as HTMLElement, (await target.getElement()) as unknown as HTMLElement, at);
    await browser.pause(200);
}

// 💡 편집 영역의 창(탭 묶음)마다 탭 제목들 (왼쪽·위쪽 창부터)
export async function panes(): Promise<string[][]> {
    return browser.execute(() => Array.from(document.querySelectorAll('.workspace-split.mod-root .workspace-tabs'))
        .map(pane => Array.from(pane.querySelectorAll('.workspace-tab-header'))
            .map(el => el.querySelector('.workspace-tab-header-inner-title')?.textContent ?? ''))
        .filter(titles => titles.length > 0));
}

// 💡 index번째 창에서 지금 보이는 편집 화면
export function paneContent(index: number) {
    return $$('.workspace-split.mod-root .workspace-tabs')[index]!.$('.workspace-leaf:not([style*="display: none"])');
}

// 💡 노트를 오른쪽에 새 창(분할)으로 엽니다.
export async function openInSplit(name: string) {
    await browser.executeObsidian(async ({ app }, name) => {
        const file = app.vault.getFileByPath(`${name}.md`);
        if (file) await app.workspace.getLeaf('split', 'vertical').openFile(file);
    }, name);
    await browser.waitUntil(async () => (await panes()).length === 2, { timeoutMsg: 'the split did not open' });
}

export async function titles(): Promise<string[]> {
    return (await tabs()).map(info => info.title);
}

// 💡 그룹 이름 → 그 그룹의 탭 제목들 (탭 바 순서)
export async function members(name: string): Promise<string[]> {
    const groupId = await browser.executeObsidian(({ plugins }, name) => {
        const groups = (plugins.tabGroups as unknown as { groups: Map<string, { name: string }> }).groups;
        return [...groups.entries()].find(([, group]) => group.name === name)?.[0] ?? null;
    }, name);
    return (await tabs()).filter(info => info.group !== null && info.group === groupId).map(info => info.title);
}
