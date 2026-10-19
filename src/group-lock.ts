import { Workspace, WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';

// ✨ "그룹 탭 잠금": 그룹에 속한 탭의 노트가 바뀌지 않게 합니다.
// 링크·탐색기·빠른 전환기가 "지금 탭에 열기"를 요청하면 새 탭을 대신 엽니다. 새 탭은 그룹 밖이고,
// 탭 메뉴로 그룹에 넣으면 그 탭도 잠깁니다.
// 💡 탭을 고정(pin)하지 않습니다. 고정하면 다른 플러그인이 고정 탭을 한쪽 끝으로 옮겨 그룹이 깨집니다.
type GetLeaf = Workspace['getLeaf'];

export class GroupLock {
    private originalGetLeaf: GetLeaf | null = null;

    constructor(private plugin: TabGroupsPlugin) {}

    // 💡 workspace.getLeaf를 감쌉니다. 끌 때(unload) 원래대로 되돌립니다.
    register() {
        const workspace = this.plugin.app.workspace;
        // 💡 메서드를 떼어 내 보관하고 workspace를 receiver로 직접 넘겨 부르므로 안전합니다. (끌 때 그대로 복원)
        // eslint-disable-next-line @typescript-eslint/unbound-method -- called later with workspace as receiver, and restored as-is on unload
        const original = workspace.getLeaf;
        this.originalGetLeaf = original;

        const wrapped = (newLeaf?: unknown, direction?: unknown) => {
            const reuseCurrentTab = newLeaf === undefined || newLeaf === false;
            const target = reuseCurrentTab && this.currentTabIsLocked(workspace) ? 'tab' : newLeaf;
            return (original as (...args: unknown[]) => WorkspaceLeaf).call(workspace, target, direction);
        };
        workspace.getLeaf = wrapped;

        this.plugin.register(() => this.release());
    }

    release() {
        if (!this.originalGetLeaf) return;
        this.plugin.app.workspace.getLeaf = this.originalGetLeaf;
        this.originalGetLeaf = null;
    }

    // 💡 "지금 탭"이 잠긴 그룹 탭인지 (옵시디언이 새 탭 없이 열려 할 때 바꿔 치울 탭)
    private currentTabIsLocked(workspace: Workspace): boolean {
        if (!this.plugin.settings.lockGroupedTabs) return false;
        const leaf = workspace.getMostRecentLeaf(workspace.rootSplit);
        return !!leaf && this.plugin.leafGroupMap.has(leaf);
    }
}
