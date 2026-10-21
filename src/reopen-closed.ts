import { WorkspaceLeaf, WorkspaceSplit } from 'obsidian';
import type TabGroupsPlugin from './main';
import { internal } from './internal';
import { SavedTab, savedTabFile, snapshotLeaf } from './saved-tabs';

// ✨ 닫은 탭 다시 열기(Ctrl+Shift+T)를 그룹과 함께 (크롬처럼)
// 옵시디언은 닫은 탭을 다시 열 때 그 탭의 ID를 그대로 되살립니다. 그래서 그룹 탭이 닫힐 때 ID마다 그룹과 자리를 기억해 두었다가,
// 같은 ID의 탭이 다시 생기면 그 그룹의 원래 자리에 넣습니다. 그사이 그룹이 지워졌으면 같은 이름·색으로 다시 만듭니다.
// 그룹을 통째로 닫았으면(숨기기·삭제) 그중 한 탭이 다시 열릴 때 나머지 탭도 함께 열어 그룹을 되살립니다.

// 💡 옵시디언 비공개 API: 닫은 탭 기록 (맨 앞이 가장 최근, 최대 10개)
interface UndoEntry {
    leafId?: string;
}

interface GroupInfo {
    name: string;
    color: string;
}

// 💡 닫힌 그룹 탭 하나: 어느 그룹이었고, 닫힐 때 그룹 탭들의 순서(ID)가 어땠는지
interface ClosedTab {
    groupId: string;
    group: GroupInfo;
    order: string[];
}

// 💡 통째로 닫은 그룹: 닫힐 때의 탭들 (ID와 다시 열 때 쓸 상태)
interface ClosedGroup {
    groupId: string;
    group: GroupInfo;
    tabs: { id: string; tab: SavedTab }[];
}

const UNDO_COMMAND = 'workspace:undo-close-pane';
// 💡 옵시디언이 닫은 탭을 10개까지 기억하므로 넉넉히
const MAX_TABS = 50;
const MAX_GROUPS = 10;

export class ReopenClosedTabs {
    private closedTabs = new Map<string, ClosedTab>();
    private closedGroups: ClosedGroup[] = [];
    // 💡 지난 정리 때 그룹마다의 탭 ID 순서와 그룹 정보 (탭이 닫힌 뒤에는 읽을 수 없어서 미리 기억)
    private lastOrder = new Map<string, string[]>();
    private lastInfo = new Map<string, GroupInfo>();
    // 💡 다시 연 탭을 정리 중에 제자리로 옮길 것들
    private pendingPlaces: { id: string; groupId: string; order: string[] }[] = [];

    constructor(private plugin: TabGroupsPlugin) {}

    // 💡 탭 바를 정리할 때마다(정렬 전) 불림: 닫힌 그룹 탭을 기억하고, 다시 열린 탭을 그룹에 넣습니다. 소속이 바뀌었으면 true.
    update(): boolean {
        const leaves = new Map<string, WorkspaceLeaf>();
        this.plugin.app.workspace.iterateAllLeaves(leaf => { leaves.set(internal(leaf).id, leaf); });
        this.rememberClosed(leaves);
        const changed = this.adoptReopened(leaves);
        this.placePending(leaves);
        return changed;
    }

    // 💡 정렬이 끝난 뒤 불림: 그룹마다 탭 순서를 기억해 둡니다.
    remember() {
        const plugin = this.plugin;
        this.lastOrder = new Map();
        this.lastInfo = new Map();
        plugin.groups.forEach((group, groupId) => {
            this.lastOrder.set(groupId, plugin.groupLeaves(groupId).map(leaf => internal(leaf).id));
            this.lastInfo.set(groupId, { name: group.name, color: group.color });
        });
    }

    // 💡 그룹을 숨기거나 삭제하기 직전에 불림: 그 그룹의 탭들을 통째로 닫은 것으로 기억합니다.
    rememberGroupClose(groupId: string) {
        const group = this.plugin.groups.get(groupId);
        const leaves = this.plugin.groupLeaves(groupId);
        if (!group || leaves.length === 0) return;
        this.forget(groupId);
        this.closedGroups.unshift({
            groupId,
            group: { name: group.name, color: group.color },
            tabs: leaves.map(leaf => ({ id: internal(leaf).id, tab: snapshotLeaf(leaf) })),
        });
        this.closedGroups.splice(MAX_GROUPS);
    }

    // 💡 그룹을 해제·삭제했거나 다른 방법으로 다시 열었을 때: 그 그룹의 닫힌 탭을 더는 그룹으로 되살리지 않습니다.
    // dropUndo면 옵시디언의 닫은 탭 기록에서도 지웁니다. (숨긴 그룹을 다시 연 뒤 같은 탭이 또 열리지 않게)
    forget(groupId: string, options: { dropUndo?: boolean } = {}) {
        const ids = new Set<string>();
        this.closedGroups = this.closedGroups.filter(record => {
            if (record.groupId !== groupId) return true;
            record.tabs.forEach(({ id }) => ids.add(id));
            return false;
        });
        this.closedTabs.forEach((closed, id) => {
            if (closed.groupId !== groupId) return;
            ids.add(id);
            this.closedTabs.delete(id);
        });
        if (!options.dropUndo) return;
        const undo = this.undoHistory();
        for (let i = undo.length - 1; i >= 0; i--) {
            if (ids.has(undo[i]!.leafId ?? '')) undo.splice(i, 1);
        }
    }

    clear() {
        this.closedTabs.clear();
        this.closedGroups = [];
        this.pendingPlaces = [];
    }

    private undoHistory(): UndoEntry[] {
        return (this.plugin.app.workspace as unknown as { undoHistory?: UndoEntry[] }).undoHistory ?? [];
    }

    // 💡 지난번에 그룹에 있던 탭 중 이제 어디에도 없는(닫힌) 탭을 기억합니다.
    // (그룹에서 뺐거나 다른 창으로 옮긴 탭은 아직 열려 있으니 해당 없음)
    private rememberClosed(leaves: Map<string, WorkspaceLeaf>) {
        this.lastOrder.forEach((order, groupId) => {
            const group = this.lastInfo.get(groupId);
            if (!group) return;
            order.forEach(id => {
                if (leaves.has(id)) return;
                this.closedTabs.delete(id);
                this.closedTabs.set(id, { groupId, group, order });
            });
        });
        // 💡 오래된 것부터 지움 (Map은 넣은 순서를 지킴)
        [...this.closedTabs.keys()].slice(0, Math.max(0, this.closedTabs.size - MAX_TABS)).forEach(id => this.closedTabs.delete(id));
    }

    // 💡 그룹 밖에 있는 탭 중 ID가 닫힌 그룹 탭과 같은 탭(= 다시 열린 탭)을 그 그룹에 넣습니다.
    private adoptReopened(leaves: Map<string, WorkspaceLeaf>): boolean {
        const plugin = this.plugin;
        let changed = false;
        leaves.forEach((leaf, id) => {
            if (plugin.leafGroupMap.has(leaf)) return;
            const record = this.closedGroups.find(group => group.tabs.some(tab => tab.id === id));
            if (record) {
                this.closedGroups = this.closedGroups.filter(group => group !== record);
                this.closedTabs.delete(id);
                this.join(leaf, record.groupId, record.group);
                this.pendingPlaces.push({ id, groupId: record.groupId, order: record.tabs.map(tab => tab.id) });
                // 💡 나머지 탭은 정리가 끝난 뒤에 엶 (지금은 감시자를 멈추고 탭 바를 정리하는 중)
                window.setTimeout(() => void this.reopenRest(record, id));
                changed = true;
                return;
            }
            const closed = this.closedTabs.get(id);
            if (!closed) return;
            this.closedTabs.delete(id);
            this.join(leaf, closed.groupId, closed.group);
            this.pendingPlaces.push({ id, groupId: closed.groupId, order: closed.order });
            changed = true;
        });
        return changed;
    }

    // 💡 탭을 그룹에 넣고 그룹을 펼칩니다. (그룹이 지워졌으면 같은 ID·이름·색으로 다시 만듦)
    private join(leaf: WorkspaceLeaf, groupId: string, info: GroupInfo) {
        const plugin = this.plugin;
        let group = plugin.groups.get(groupId);
        if (!group) {
            group = { name: info.name, color: info.color, leafIds: new Set(), isCollapsed: false, tabs: [] };
            plugin.groups.set(groupId, group);
        }
        group.isCollapsed = false;
        plugin.leafGroupMap.set(leaf, groupId);
    }

    // 💡 다시 연 탭을 닫힐 때의 자리로: 그때 바로 앞에 있던 탭 중 지금도 그룹에 있는 탭 뒤 (없으면 뒤에 있던 탭 앞)
    // 탭 바의 헤더를 옮겨 두면 이어지는 정렬이 그 순서대로 옵시디언 내부 순서도 맞춥니다.
    private placePending(leaves: Map<string, WorkspaceLeaf>) {
        const plugin = this.plugin;
        const waiting: typeof this.pendingPlaces = [];
        this.pendingPlaces.forEach(place => {
            const leaf = leaves.get(place.id);
            if (!leaf) return;
            const header = internal(leaf).tabHeaderEl;
            // 💡 헤더가 아직 탭 바에 없으면 다음 정리 때 다시
            if (!header?.parentElement) {
                waiting.push(place);
                return;
            }
            const headerOf = (id: string) => {
                const other = leaves.get(id);
                if (!other || other === leaf || plugin.leafGroupMap.get(other) !== place.groupId) return null;
                const el = internal(other).tabHeaderEl;
                return el?.parentElement === header.parentElement ? el : null;
            };
            const at = place.order.indexOf(place.id);
            for (let i = at - 1; i >= 0; i--) {
                const before = headerOf(place.order[i]!);
                if (before) return before.after(header);
            }
            for (let i = at + 1; i < place.order.length; i++) {
                const after = headerOf(place.order[i]!);
                if (after) return after.before(header);
            }
        });
        this.pendingPlaces = waiting;
    }

    // 💡 통째로 닫은 그룹의 나머지 탭을 엽니다. 옵시디언이 아직 기억하는 탭은 "닫은 탭 다시 열기"로
    // (뒤로 가기 기록·스크롤까지 되살아남), 기억 밖으로 밀려난 탭은 닫힐 때의 상태로 새로 엽니다.
    private async reopenRest(record: ClosedGroup, firstId: string) {
        const plugin = this.plugin;
        const workspace = plugin.app.workspace;
        const find = (id: string) => {
            let found: WorkspaceLeaf | null = null;
            workspace.iterateAllLeaves(leaf => { if (internal(leaf).id === id) found = leaf; });
            return found as WorkspaceLeaf | null;
        };
        const first = find(firstId);
        if (!first) return;
        const parent = internal(first).parent;
        const undo = this.undoHistory();
        // 💡 닫힐 때의 순서 (새로 연 탭은 ID가 달라서 바꿔 끼움)
        const order = record.tabs.map(tab => tab.id);
        const opened: string[] = [firstId];

        for (const { id, tab } of record.tabs) {
            if (id === firstId || find(id)) continue;
            this.closedTabs.delete(id);
            const index = undo.findIndex(entry => entry.leafId === id);
            let leaf: WorkspaceLeaf | null = null;
            if (index !== -1) {
                undo.unshift(...undo.splice(index, 1));
                (plugin.app as unknown as { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById(UNDO_COMMAND);
                leaf = find(id);
            } else {
                const file = savedTabFile(tab);
                if (file && !plugin.app.vault.getAbstractFileByPath(file)) continue;
                leaf = parent
                    ? workspace.createLeafInParent(parent as unknown as WorkspaceSplit, parent.children.length)
                    : workspace.getLeaf('tab');
                await leaf.setViewState({ type: tab.type, state: tab.state, active: false });
            }
            if (!leaf) continue;
            this.join(leaf, record.groupId, record.group);
            order[order.indexOf(id)] = internal(leaf).id;
            opened.push(internal(leaf).id);
        }
        order.filter(id => opened.includes(id)).forEach(id => this.pendingPlaces.push({ id, groupId: record.groupId, order }));

        await plugin.saveSettings();
        plugin.enforcePhysicalSorting();
        workspace.setActiveLeaf(first, { focus: true });
    }
}
