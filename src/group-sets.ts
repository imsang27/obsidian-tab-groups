import { Notice, WorkspaceLeaf, WorkspaceSplit } from 'obsidian';
import type TabGroupsPlugin from './main';
import { t } from './i18n';
import { internal } from './internal';
import { SavedTab, renameSavedTabs, savedTabFile, snapshotLeaf } from './saved-tabs';
import { GroupSetNameModal } from './ui/group-modals';

// ✨ 그룹 세트: 옵시디언의 작업 공간(Workspaces)처럼, 지금 그룹 구성을 이름 붙여 저장했다가 다시 엽니다.
// 그룹마다 이름·색·접힘 상태와 탭(노트 경로·화면 상태)을 기억합니다. (data.json에 저장)

export interface GroupSetGroup {
    name: string;
    color: string;
    isCollapsed: boolean;
    tabs: SavedTab[];
}

export interface GroupSet {
    name: string;
    groups: GroupSetGroup[];
}

// 💡 지금 그룹들: 열린 그룹은 그 탭들, 숨긴 그룹은 기억한 탭들 (탭이 없는 그룹은 뺌)
export function snapshotGroups(plugin: TabGroupsPlugin): GroupSetGroup[] {
    const groups: GroupSetGroup[] = [];
    plugin.groups.forEach((group, groupId) => {
        const leaves = plugin.groupLeaves(groupId);
        const tabs = leaves.length > 0 ? leaves.map(snapshotLeaf) : group.tabs.map(tab => ({ ...tab, state: tab.state && { ...tab.state } }));
        if (tabs.length > 0) groups.push({ name: group.name, color: group.color, isCollapsed: group.isCollapsed, tabs });
    });
    return groups;
}

// 💡 같은 이름의 세트가 있으면 바꿔 씁니다. 저장한 그룹 수를 돌려줍니다.
export async function saveGroupSet(plugin: TabGroupsPlugin, name: string): Promise<number> {
    const groups = snapshotGroups(plugin);
    plugin.settings.groupSets = [...plugin.settings.groupSets.filter(set => set.name !== name), { name, groups }];
    await plugin.saveSettings();
    return groups.length;
}

// 💡 이름을 물어 지금 그룹들을 세트로 저장 (명령과 설정 화면의 + 버튼이 같이 씀)
export function promptSaveGroupSet(plugin: TabGroupsPlugin) {
    new GroupSetNameModal(plugin.app, async name => {
        const count = await saveGroupSet(plugin, name);
        new Notice(t('notice.setSaved', { name, count: String(count) }));
    }).open();
}

export async function deleteGroupSet(plugin: TabGroupsPlugin, name: string) {
    plugin.settings.groupSets = plugin.settings.groupSets.filter(set => set.name !== name);
    await plugin.saveSettings();
}

// ✨ 세트의 그룹들을 지금 탭 묶음 끝에 새로 엽니다. (지금 있는 그룹은 그대로 둠)
// 지워진 노트는 건너뛰고 알려 주며, 저장할 때 접혀 있던 그룹은 연 뒤 다시 접습니다.
export async function openGroupSet(plugin: TabGroupsPlugin, set: GroupSet) {
    const workspace = plugin.app.workspace;
    const anchor = workspace.getMostRecentLeaf();
    const parent = anchor ? internal(anchor).parent : null;

    let missing = 0;
    let first: WorkspaceLeaf | null = null;
    const collapse: string[] = [];
    for (const [i, saved] of set.groups.entries()) {
        const groupId = `group-${Date.now()}-${i}`;
        let opened = 0;
        for (const tab of saved.tabs) {
            const file = savedTabFile(tab);
            if (file && !plugin.app.vault.getAbstractFileByPath(file)) {
                missing++;
                continue;
            }
            if (opened === 0) plugin.groups.set(groupId, { name: saved.name, color: saved.color, leafIds: new Set(), isCollapsed: false, tabs: [] });
            const leaf = parent
                ? workspace.createLeafInParent(parent as unknown as WorkspaceSplit, parent.children.length)
                : workspace.getLeaf('tab');
            plugin.leafGroupMap.set(leaf, groupId);
            await leaf.setViewState({ type: tab.type, state: tab.state, active: false });
            first ??= leaf;
            opened++;
        }
        if (opened > 0 && saved.isCollapsed) collapse.push(groupId);
    }

    if (missing > 0) new Notice(t('notice.missingTabs', { count: String(missing) }));
    if (!first) return;
    await plugin.saveSettings();
    plugin.enforcePhysicalSorting();
    workspace.setActiveLeaf(first, { focus: true });
    // 💡 라벨을 누른 것과 같게 접음 (선택된 탭이 그 그룹 안이면 옆 탭으로 옮김)
    for (const groupId of collapse) {
        const group = plugin.groups.get(groupId);
        if (group) await plugin.labels.toggleCollapsed(groupId, group);
    }
}

// 💡 노트·폴더 이름이 바뀌면 세트에 기억한 경로도 따라 바꿉니다. 바뀐 게 있으면 true.
export function renameInGroupSets(plugin: TabGroupsPlugin, oldPath: string, newPath: string): boolean {
    let changed = false;
    plugin.settings.groupSets.forEach(set => set.groups.forEach(group => {
        if (renameSavedTabs(group.tabs, oldPath, newPath)) changed = true;
    }));
    return changed;
}
