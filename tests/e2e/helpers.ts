import { $, browser } from '@wdio/globals';
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
    await $(".modal").$(`button=${text}`).click();
}
