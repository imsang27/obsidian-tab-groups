import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { CreateGroupModal, EditGroupModal } from './ui/group-modals';

// ✨ 탭 메뉴·명령어·라벨이 함께 쓰는 그룹 동작 (결과는 바로 data.json에 저장하고 탭 바를 다시 정리)

// 💡 새 그룹 만들기 창을 열고, 만들면 그 탭을 새 그룹에 넣습니다.
export function createGroupWith(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf) {
    new CreateGroupModal(plugin.app, plugin.nextGroupColor(), async (groupName, color) => {
        const groupId = 'group-' + Date.now();
        plugin.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false });
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
