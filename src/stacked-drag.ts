import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { internal } from './internal';
import { isStackedContainer, setStackedOrder } from './stacked-order';

// ✨ 쌓인 탭(Stacked tabs) 모드에서 그룹 라벨을 막대 위로 끌어 놓으면 그룹째 옮깁니다. (탭 바에서 라벨을 끌 때와 같게)
// 막대 사이에는 플레이스홀더를 끼우면 막대 위치가 어긋나므로, 들어갈 자리는 앞·뒤 막대에 선을 그어 보여 줍니다.
// 다른 그룹은 한 덩어리로 보고 그 앞·뒤에만 놓습니다. 끌기와 놓기 이벤트는 GroupDropHandler(group-drop.ts)가 넘겨줌.
const DROP_BEFORE = 'tab-group-stacked-drop-before';
const DROP_AFTER = 'tab-group-stacked-drop-after';

interface StackedDropTarget {
    leaf: WorkspaceLeaf;
    after: boolean;
}

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
