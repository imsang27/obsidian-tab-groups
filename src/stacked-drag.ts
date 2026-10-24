import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { InternalTabs, internal } from './internal';
import { isStackedContainer, setStackedOrder } from './stacked-order';
import { droppedGroup } from './tab-move';
import { setGroupColor } from './group-style';

// ✨ 쌓인 탭(Stacked tabs) 모드에서 그룹 라벨을 막대 위로 끌어 놓으면 그룹째 옮깁니다. (탭 바에서 라벨을 끌 때와 같게)
// 막대 사이에는 플레이스홀더를 끼우면 막대 위치가 어긋나므로, 들어갈 자리는 앞·뒤 막대에 선을 그어 보여 줍니다.
// 다른 그룹은 한 덩어리로 보고 그 앞·뒤에만 놓습니다. 끌기와 놓기 이벤트는 GroupDropHandler(group-drop.ts)가 넘겨줌.
const DROP_BEFORE = 'tab-group-stacked-drop-before';
const DROP_AFTER = 'tab-group-stacked-drop-after';

interface StackedDropTarget {
    leaf: WorkspaceLeaf;
    after: boolean;
}

// 💡 탭 막대 하나를 쌓인 탭 묶음에 놓을 자리: 다른 탭들 사이의 위치와 들어갈 그룹
export interface StackedTabSlot {
    index: number;
    groupId: string | null;
}

// 💡 옵시디언 비공개 API: 탭 묶음의 DOM, 커서 x로 탭을 끼울 위치, 끌기 중 드롭 선
interface StackedTabsInternals {
    containerEl: HTMLElement;
    tabHeaderContainerEl?: HTMLElement;
    getTabInsertLocation?(clientX: number): { index: number };
}
interface DragManager {
    overlayEl?: HTMLElement;
}
const IN_GROUP = 'tab-group-drop-in-group';

const isHidden = (el: Element) => window.getComputedStyle(el).display === 'none';

export class StackedGroupDrop {
    target: StackedDropTarget | null = null;
    markedEl: HTMLElement | null = null;

    constructor(private plugin: TabGroupsPlugin) {}

    // 💡 커서 아래가 쌓인 탭의 막대면 그 묶음을 돌려줍니다.
    containerAt(target: HTMLElement): HTMLElement | null {
        const container = target.closest?.('.workspace-tab-header')?.parentElement;
        return container && isStackedContainer(container) ? container : null;
    }

    // 💡 커서 위치로 들어갈 자리를 정하고 표시합니다. (덩어리 가운데를 넘었는지로)
    update(container: HTMLElement, clientX: number, groupId: string) {
        const plugin = this.plugin;
        const blocks: WorkspaceLeaf[][] = [];
        let lastGroup: string | null = null;
        plugin.tabMoves.leavesOf(container).forEach(leaf => {
            const id = plugin.leafGroupMap.get(leaf) ?? null;
            if (id === groupId) return;
            if (id && id === lastGroup) blocks[blocks.length - 1]!.push(leaf);
            else blocks.push([leaf]);
            lastGroup = id;
        });
        const visible = blocks
            .map(leaves => ({ leaves, headers: leaves.map(l => internal(l).tabHeaderEl).filter((h): h is HTMLElement => !!h && !isHidden(h)) }))
            .filter(block => block.headers.length > 0);

        const before = visible.find(block => {
            const left = block.headers[0]!.getBoundingClientRect().left;
            const right = block.headers[block.headers.length - 1]!.getBoundingClientRect().right;
            return clientX < (left + right) / 2;
        });
        const last = visible[visible.length - 1];
        this.clear();
        if (before) {
            this.target = { leaf: before.leaves[0]!, after: false };
            this.mark(before.headers[0]!, DROP_BEFORE);
        } else if (last) {
            this.target = { leaf: last.leaves[last.leaves.length - 1]!, after: true };
            this.mark(last.headers[last.headers.length - 1]!, DROP_AFTER);
        }
    }

    mark(el: HTMLElement, cls: string) {
        el.addClass(cls);
        this.markedEl = el;
    }

    clear() {
        this.markedEl?.removeClasses([DROP_BEFORE, DROP_AFTER]);
        this.markedEl = null;
        this.target = null;
    }

    // ✨ 탭 막대 하나를 끌 때 (탭 바에서 끌 때처럼 편입·이탈을 미리 보여 줌)
    // 옵시디언이 쌓인 탭 묶음 위에 그리는 드롭 선을, 놓으면 그룹에 들어가는 자리면 그 그룹 색으로 칠합니다.
    // 자리는 옵시디언과 같게 정함: 위쪽 띠·아래 1/3은 분할, 나머지는 커서 x로 막대 사이 (getDropDirection·getTabInsertLocation)
    // 옮기기는 옵시디언이 끌기 끝에 하고, 그룹은 같은 규칙(droppedGroup)으로 tab-move.ts가 정함
    tabSlot(e: DragEvent, leaf: WorkspaceLeaf): StackedTabSlot | null {
        const plugin = this.plugin;
        const tabsEl = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-tabs.mod-stacked');
        if (!tabsEl) return null;
        let parent: (InternalTabs & StackedTabsInternals) | null = null;
        plugin.app.workspace.iterateAllLeaves(l => {
            const p = internal(l).parent as (InternalTabs & StackedTabsInternals) | null;
            if (!parent && p?.containerEl === tabsEl) parent = p;
        });
        const tabs = parent as (InternalTabs & StackedTabsInternals) | null;
        if (!tabs?.getTabInsertLocation) return null;

        const rect = tabsEl.getBoundingClientRect();
        const headerHeight = tabs.tabHeaderContainerEl?.getBoundingClientRect().height ?? 0;
        const fromTop = e.clientY - rect.top;
        if (fromTop <= headerHeight) return null; // 위쪽 탭 바 줄은 탭 바 끌기(tab-drag.ts)나 옵시디언 분할
        if ((rect.bottom - e.clientY) / rect.height < 0.33) return null;

        let index = tabs.getTabInsertLocation(e.clientX).index;
        const from = tabs.children.indexOf(leaf);
        if (from !== -1 && index > from) index--;
        const others = tabs.children.filter(l => l !== leaf);
        const groupOf = (l: WorkspaceLeaf | undefined) => (l && plugin.leafGroupMap.get(l)) ?? null;
        const current = groupOf(leaf);
        const groupId = from === index
            ? current
            : droppedGroup(others, index, current, groupOf, groupId => plugin.isGroupExpanded(groupId));
        return { index, groupId };
    }

    // 💡 드롭 선 색: 그룹에 들어가는 자리면 그 그룹 색, 아니면 옵시디언 기본 색
    showTabSlot(slot: StackedTabSlot | null) {
        const overlay = this.overlayEl();
        if (!overlay) return;
        const color = slot?.groupId ? this.plugin.groups.get(slot.groupId)?.color : undefined;
        overlay.toggleClass(IN_GROUP, !!color);
        if (color) setGroupColor(overlay, color);
    }

    overlayEl(): HTMLElement | null {
        return (this.plugin.app as unknown as { dragManager?: DragManager }).dragManager?.overlayEl ?? null;
    }

    // 💡 놓기: 그룹의 탭들을 정한 자리로 옮깁니다. (다른 탭 묶음에서 왔으면 그 묶음으로 옮겨 넣음)
    drop(groupId: string) {
        const plugin = this.plugin;
        const target = this.target;
        this.clear();
        const dragged = plugin.groupLeaves(groupId);
        const targetParent = target ? internal(target.leaf).parent : null;
        if (!target || !targetParent || dragged.length === 0) return;

        const crossParent = dragged.some(leaf => internal(leaf).parent !== targetParent);
        if (crossParent) {
            dragged.forEach(leaf => internal(leaf).parent?.removeChild(leaf));
            const index = targetParent.children.indexOf(target.leaf) + (target.after ? 1 : 0);
            dragged.forEach((leaf, i) => targetParent.insertChild(index + i, leaf));
        } else {
            const order = targetParent.children.filter(leaf => !dragged.includes(leaf));
            order.splice(order.indexOf(target.leaf) + (target.after ? 1 : 0), 0, ...dragged);
            setStackedOrder(order);
        }
        // 💡 그룹 통째 이동이라 탭 이동 판정은 끔
        plugin.enforcePhysicalSorting({ trackMoves: false });
        if (crossParent) plugin.app.workspace.setActiveLeaf(dragged[0]!, { focus: true });
    }
}
