import { Notice, WorkspaceLeaf, WorkspaceSplit } from 'obsidian';
import { t } from './i18n';
import { internal } from './internal';
import { savedTabFile } from './saved-tabs';
import type TabGroupsPlugin from './main';
import { ConfirmModal, CreateGroupModal, EditGroupModal } from './ui/group-modals';

// ✨ 탭 메뉴·명령어·라벨이 함께 쓰는 그룹 동작 (결과는 바로 data.json에 저장하고 탭 바를 다시 정리)

// 💡 새 그룹 만들기 창을 열고, 만들면 그 탭을 새 그룹에 넣습니다.
export function createGroupWith(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf) {
    new CreateGroupModal(plugin.app, plugin.nextGroupColor(), async (groupName, color) => {
        const groupId = 'group-' + Date.now();
        plugin.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false, tabs: [] });
        plugin.leafGroupMap.set(leaf, groupId);
        await plugin.saveSettings();
        plugin.enforcePhysicalSorting();
    }).open();
}

// 💡 탭을 그룹에 넣습니다. (접힌 그룹이면 펼쳐서 넣은 탭이 보이게)
export async function addToGroup(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf, groupId: string) {
    const groupData = plugin.groups.get(groupId);
    if (!groupData) return;
    plugin.leafGroupMap.set(leaf, groupId);
    groupData.isCollapsed = false;
    await plugin.saveSettings();
    plugin.enforcePhysicalSorting();
}

export async function removeFromGroup(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf) {
    plugin.leafGroupMap.delete(leaf);
    await plugin.saveSettings();
    plugin.enforcePhysicalSorting();
}

// 💡 그룹 관리 창 (이름·색 바꾸기, 닫기·삭제·해제). 라벨 우클릭과 명령어가 같이 씁니다.
export function openEditGroup(plugin: TabGroupsPlugin, groupId: string) {
    const groupData = plugin.groups.get(groupId);
    if (!groupData) return;
    new EditGroupModal(
        plugin.app,
        groupData.name,
        groupData.color,
        async (newName, newColor) => {
            groupData.name = newName;
            groupData.color = newColor;
            await plugin.saveSettings();
            plugin.enforcePhysicalSorting();
        },
        (action) => plugin.labels.applyAction(groupId, action)
    ).open();
}

// 💡 그룹 삭제 전 확인 (열린 탭이 있으면 탭도 닫힌다는 걸 알림). 열린 탭이 없으면 바로 지웁니다.
export function confirmDeleteGroup(plugin: TabGroupsPlugin, groupId: string, onDeleted?: () => void) {
    const groupData = plugin.groups.get(groupId);
    if (!groupData) return;
    const remove = async () => {
        await plugin.deleteGroup(groupId);
        onDeleted?.();
    };
    const count = plugin.groupLeaves(groupId).length;
    if (count === 0) {
        void remove();
        return;
    }
    new ConfirmModal(
        plugin.app,
        t('confirm.deleteTitle'),
        t('confirm.deleteDesc', { name: groupData.name || t('group.unnamed'), count: String(count) }),
        t('confirm.delete'),
        remove,
    ).open();
}

// 💡 숨은 그룹 다시 열기: 기억한 탭들을 지금 탭 바 끝에 원래 순서대로 열고, 같은 그룹으로 묶어 펼칩니다.
// 지워진 노트는 건너뛰고 알림으로 알려 줍니다.
export async function reopenGroup(plugin: TabGroupsPlugin, groupId: string) {
    const groupData = plugin.groups.get(groupId);
    if (!groupData || groupData.tabs.length === 0) return;
    const workspace = plugin.app.workspace;
    const anchor = workspace.getMostRecentLeaf();
    const parent = anchor ? internal(anchor).parent : null;

    const opened: WorkspaceLeaf[] = [];
    let missing = 0;
    for (const tab of groupData.tabs) {
        const file = savedTabFile(tab);
        if (file && !plugin.app.vault.getAbstractFileByPath(file)) {
            missing++;
            continue;
        }
        const leaf = parent
            ? workspace.createLeafInParent(parent as unknown as WorkspaceSplit, parent.children.length)
            : workspace.getLeaf('tab');
        plugin.leafGroupMap.set(leaf, groupId);
        await leaf.setViewState({ type: tab.type, state: tab.state, active: false });
        opened.push(leaf);
    }

    if (missing > 0) new Notice(t('notice.missingTabs', { count: String(missing) }));
    if (opened.length === 0) return;
    groupData.isCollapsed = false;
    await plugin.saveSettings();
    plugin.enforcePhysicalSorting();
    workspace.setActiveLeaf(opened[0]!, { focus: true });
}
