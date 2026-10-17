import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';

// ✨ 파일 탐색기에서 노트를 클릭했을 때, 그 노트가 접힌 그룹의 숨은 탭에 이미 열려 있으면
// 지금 탭에 같은 노트를 또 여는 대신 그룹을 펼치고 그 탭으로 이동합니다.
// (Ctrl·Shift·Alt 등 보조키를 누른 클릭은 새 탭·분할 등 옵시디언 기본 동작에 맡김)
export function registerExplorerOpen(plugin: TabGroupsPlugin) {
    plugin.registerDomEvent(document, 'click', (e: MouseEvent) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const item = (e.target as HTMLElement).closest?.<HTMLElement>('.nav-file-title');
        const path = item?.getAttribute('data-path');
        if (!path) return;

        const leaf = findHiddenLeafWithFile(plugin, path);
        if (!leaf) return;

        // 💡 옵시디언 탐색기보다 먼저(capture) 받아 기본 열기를 막습니다.
        e.preventDefault();
        e.stopPropagation();
        void revealLeaf(plugin, leaf);
    }, { capture: true });
}

// 💡 본문 영역에서 이 노트를 연 탭 중 접힌 그룹에 숨은 탭
function findHiddenLeafWithFile(plugin: TabGroupsPlugin, path: string): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    plugin.app.workspace.iterateRootLeaves(leaf => {
        const file = (leaf.view as { file?: { path: string } | null }).file;
        if (!found && file?.path === path && plugin.isLeafHidden(leaf)) found = leaf;
    });
    return found;
}

// 💡 그룹을 먼저 펼친 뒤 활성화합니다. (활성화를 먼저 하면 한 칸 이동으로 오인해 건너뛸 수 있음)
async function revealLeaf(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf) {
    const groupId = plugin.leafGroupMap.get(leaf);
    const group = groupId ? plugin.groups.get(groupId) : undefined;
    if (group) group.isCollapsed = false;
    plugin.enforcePhysicalSorting();
    plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
    await plugin.saveSettings();
}
