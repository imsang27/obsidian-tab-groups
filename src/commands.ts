import { App, FuzzySuggestModal, ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import type { TabGroupData } from './main';
import { t } from './i18n';
import { addToGroup, createGroupWith, groupByFolder, openEditGroup, removeFromGroup, reopenGroup, ungroupedTabs } from './group-actions';

// ✨ 명령어 (명령 팔레트·단축키): 지금 선택된 탭을 기준으로 그룹을 다룹니다.
// 💡 명령 이름은 켜질 때의 언어로 정해집니다. (언어를 바꾸면 다시 켠 뒤 반영)
export function registerCommands(plugin: TabGroupsPlugin) {
    const activeLeaf = (): WorkspaceLeaf | null => plugin.app.workspace.getActiveViewOfType(ItemView)?.leaf ?? null;
    const activeGroupId = () => {
        const leaf = activeLeaf();
        return leaf ? plugin.leafGroupMap.get(leaf) ?? null : null;
    };

    plugin.addCommand({
        id: 'create-group-from-active-tab',
        name: t('command.createGroup'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            if (!leaf) return false;
            if (!checking) createGroupWith(plugin, leaf);
            return true;
        },
    });

    plugin.addCommand({
        id: 'create-group-from-ungrouped-tabs',
        name: t('command.groupUngrouped'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            const leaves = leaf ? ungroupedTabs(plugin, leaf) : [];
            if (leaves.length === 0) return false;
            if (!checking) createGroupWith(plugin, leaves);
            return true;
        },
    });

    plugin.addCommand({
        id: 'group-tabs-by-folder',
        name: t('command.groupByFolder'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            const leaves = leaf ? ungroupedTabs(plugin, leaf) : [];
            if (leaves.length < 2) return false;
            if (!checking) {
                void groupByFolder(plugin, leaves).then(count => {
                    // 💡 묶을 폴더가 없었으면 알려 줌 (같은 폴더의 탭이 2개 이상이어야 묶음)
                    if (count === 0) new Notice(t('notice.noFolderGroups'));
                });
            }
            return true;
        },
    });

    plugin.addCommand({
        id: 'add-active-tab-to-group',
        name: t('command.addToGroup'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            const current = leaf ? plugin.leafGroupMap.get(leaf) : undefined;
            // 💡 숨은 그룹은 빼고 (넣으면 기억한 탭 목록이 그 탭 하나로 바뀜)
            const choices = [...plugin.groups.entries()].filter(([id]) => id !== current && !plugin.isGroupHidden(id));
            if (!leaf || choices.length === 0) return false;
            if (!checking) new GroupSuggestModal(plugin.app, choices, groupId => { void addToGroup(plugin, leaf, groupId); }).open();
            return true;
        },
    });

    plugin.addCommand({
        id: 'remove-active-tab-from-group',
        name: t('command.removeFromGroup'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            if (!leaf || !plugin.leafGroupMap.get(leaf)) return false;
            if (!checking) void removeFromGroup(plugin, leaf);
            return true;
        },
    });

    plugin.addCommand({
        id: 'toggle-active-group',
        name: t('command.toggleGroup'),
        checkCallback: (checking) => {
            const groupId = activeGroupId();
            const groupData = groupId ? plugin.groups.get(groupId) : undefined;
            if (!groupId || !groupData) return false;
            if (!checking) void plugin.labels.toggleCollapsed(groupId, groupData);
            return true;
        },
    });

    plugin.addCommand({
        id: 'reopen-hidden-group',
        name: t('command.reopenGroup'),
        checkCallback: (checking) => {
            const hidden = [...plugin.groups.entries()].filter(([id]) => plugin.isGroupHidden(id));
            if (hidden.length === 0) return false;
            if (!checking) new GroupSuggestModal(plugin.app, hidden, groupId => { void reopenGroup(plugin, groupId); }).open();
            return true;
        },
    });

    plugin.addCommand({
        id: 'edit-active-group',
        name: t('command.editGroup'),
        checkCallback: (checking) => {
            const groupId = activeGroupId();
            if (!groupId || !plugin.groups.has(groupId)) return false;
            if (!checking) openEditGroup(plugin, groupId);
            return true;
        },
    });

    // 💡 열린 탭이 있는 그룹만 (숨은 그룹은 탭 바에 없음). 접기·펼치기는 라벨을 누른 것과 같게 처리
    const openGroups = (collapsed: boolean) => [...plugin.groups.entries()]
        .filter(([id, group]) => group.isCollapsed === collapsed && plugin.groupLeaves(id).length > 0);

    plugin.addCommand({
        id: 'collapse-all-groups',
        name: t('command.collapseAll'),
        checkCallback: (checking) => {
            const groups = openGroups(false);
            if (groups.length === 0) return false;
            if (!checking) void (async () => { for (const [id, group] of groups) await plugin.labels.toggleCollapsed(id, group); })();
            return true;
        },
    });

    plugin.addCommand({
        id: 'expand-all-groups',
        name: t('command.expandAll'),
        checkCallback: (checking) => {
            const groups = openGroups(true);
            if (groups.length === 0) return false;
            if (!checking) void (async () => { for (const [id, group] of groups) await plugin.labels.toggleCollapsed(id, group); })();
            return true;
        },
    });

    // 💡 지금 탭 묶음에서 다음·이전 그룹의 첫 탭으로 (끝에서는 반대쪽 끝으로 돌아감). 접힌 그룹이면 그 탭을 열면서 펼쳐짐
    const groupStep = (direction: 1 | -1) => (checking: boolean) => {
        const leaf = activeLeaf();
        const target = leaf ? neighborGroupStart(plugin, leaf, direction) : null;
        if (!target) return false;
        if (!checking) plugin.app.workspace.setActiveLeaf(target, { focus: true });
        return true;
    };

    plugin.addCommand({
        id: 'go-to-next-group',
        name: t('command.nextGroup'),
        checkCallback: groupStep(1),
    });

    plugin.addCommand({
        id: 'go-to-previous-group',
        name: t('command.previousGroup'),
        checkCallback: groupStep(-1),
    });

    plugin.addCommand({
        id: 'hide-active-group',
        name: t('command.hideGroup'),
        checkCallback: (checking) => {
            const groupId = activeGroupId();
            if (!groupId || !plugin.groups.has(groupId)) return false;
            if (!checking) void plugin.hideGroup(groupId);
            return true;
        },
    });
}

// 💡 leaf가 있는 탭 묶음에서, leaf 다음(또는 이전) 쪽으로 처음 나오는 다른 그룹의 첫 탭. 그룹이 하나도 없으면 null
function neighborGroupStart(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf, direction: 1 | -1): WorkspaceLeaf | null {
    const children = (leaf as unknown as { parent?: { children?: WorkspaceLeaf[] } }).parent?.children ?? [];
    const firsts: WorkspaceLeaf[] = [];
    const seen = new Set<string>();
    for (const child of children) {
        const groupId = plugin.leafGroupMap.get(child);
        if (groupId && !seen.has(groupId)) {
            seen.add(groupId);
            firsts.push(child);
        }
    }
    if (firsts.length === 0) return null;

    const index = children.indexOf(leaf);
    const current = plugin.leafGroupMap.get(leaf);
    const ordered = direction === 1 ? firsts : [...firsts].reverse();
    const ahead = ordered.find(first => {
        const at = children.indexOf(first);
        return plugin.leafGroupMap.get(first) !== current && (direction === 1 ? at > index : at < index);
    });
    // 끝까지 없으면 반대쪽 끝에서부터 (지금 그룹만 있으면 그대로 null)
    return ahead ?? ordered.find(first => plugin.leafGroupMap.get(first) !== current) ?? null;
}

// 💡 넣을 그룹 고르기 (이름 없는 그룹은 "이름 없는 그룹"으로 표시)
class GroupSuggestModal extends FuzzySuggestModal<[string, TabGroupData]> {
    constructor(app: App, private choices: [string, TabGroupData][], private onChoose: (groupId: string) => void) {
        super(app);
        this.setPlaceholder(t('command.chooseGroup'));
    }

    getItems() {
        return this.choices;
    }

    getItemText([, group]: [string, TabGroupData]) {
        return group.name || t('group.unnamed');
    }

    onChooseItem([groupId]: [string, TabGroupData]) {
        this.onChoose(groupId);
    }
}
