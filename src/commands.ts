import { App, FuzzySuggestModal, ItemView, WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import type { TabGroupData } from './main';
import { t } from './i18n';
import { addToGroup, createGroupWith, openEditGroup, removeFromGroup } from './group-actions';

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
        id: 'add-active-tab-to-group',
        name: t('command.addToGroup'),
        checkCallback: (checking) => {
            const leaf = activeLeaf();
            const current = leaf ? plugin.leafGroupMap.get(leaf) : undefined;
            const choices = [...plugin.groups.entries()].filter(([id]) => id !== current);
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
        id: 'edit-active-group',
        name: t('command.editGroup'),
        checkCallback: (checking) => {
            const groupId = activeGroupId();
            if (!groupId || !plugin.groups.has(groupId)) return false;
            if (!checking) openEditGroup(plugin, groupId);
            return true;
        },
    });
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
