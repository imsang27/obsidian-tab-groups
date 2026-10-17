import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { resolveGroupAt } from './tab-group-rules';

interface LeafMove {
    leaf: WorkspaceLeaf;
    from: number;
    to: number;
}

// ✨ 단축키나 다른 플러그인(Pane Relief "Swap tab with next/previous" 등)으로 탭 순서가 바뀌었을 때
// 크롬처럼 펼쳐진 그룹에는 들어가고, 그룹 가장자리에서는 빠져나오게 합니다.
// 탭 바마다 직전에 정렬한 순서를 기억해 두었다가, 탭 하나만 옮겨졌으면 그 탭의 그룹 소속을 맞춥니다.
export class TabMoveTracker {
    plugin: TabGroupsPlugin;
    lastOrders: WeakMap<Element, WorkspaceLeaf[]> = new WeakMap();

    constructor(plugin: TabGroupsPlugin) {
        this.plugin = plugin;
    }

    // 💡 정렬이 끝난 뒤의 순서를 다음 비교 기준으로 기억합니다.
    remember(container: Element) {
        this.lastOrders.set(container, this.leavesOf(container));
    }

    // 💡 탭 하나가 옮겨졌으면 그룹 소속(과 필요하면 자리)을 고칩니다. 소속이 바뀌었으면 true.
    applyMove(container: Element): boolean {
        const before = this.lastOrders.get(container);
        if (!before) return false;
        const now = this.leavesOf(container);
        const move = findMovedLeaf(before, now, this.activeLeafIn(container, now));
        if (!move) return false;

        const { leaf, from, to } = move;
        const groupOf = (l: WorkspaceLeaf | undefined) => (l && this.plugin.leafGroupMap.get(l)) ?? null;
        const isExpanded = (groupId: string) => this.plugin.isGroupExpanded(groupId);
        const current = groupOf(leaf);
        const others = now.filter(l => l !== leaf);

        let newGroup: string | null;
        let newIndex: number | null = null; // others 기준으로 다시 놓을 자리 (null이면 옮겨진 자리 그대로)

        if (Math.abs(to - from) === 1) {
            // 🎯 한 칸 이동: 크롬처럼 그룹 경계(라벨)를 넘는 것도 한 걸음으로 칩니다.
            const direction = to - from;
            const neighborGroup = groupOf(before[from + direction]);
            if (current && neighborGroup !== current) {
                // 자기 그룹 가장자리에서 밖으로 → 자리는 그대로 두고 그룹에서만 빠짐
                newGroup = null;
                newIndex = from;
            } else if (!current && neighborGroup && isExpanded(neighborGroup)) {
                // 펼쳐진 그룹 쪽으로 → 자리는 그대로 두고 그 그룹의 가장자리 탭으로 편입
                newGroup = neighborGroup;
                newIndex = from;
            } else if (!current && neighborGroup) {
                // 접힌 그룹 → 그룹 전체를 한 덩어리로 건너뜀
                newGroup = null;
                newIndex = direction > 0
                    ? blockEdge(others, from, 1, neighborGroup, groupOf) + 1
                    : blockEdge(others, from - 1, -1, neighborGroup, groupOf);
            } else {
                newGroup = current; // 같은 그룹 안, 또는 그룹 밖끼리의 이동
            }
        } else {
            // 🎯 여러 칸 이동(맨 앞으로 등): 드래그 드롭과 같은 규칙으로 새 자리 양옆을 봅니다.
            const prevGroup = groupOf(others[to - 1]);
            const nextGroup = groupOf(others[to]);
            if (current && nextGroup === current && prevGroup !== current) {
                newGroup = current; // 자기 그룹 맨 앞
            } else {
                newGroup = resolveGroupAt(
                    to > 0 ? { groupId: prevGroup, isLabel: false } : null,
                    // 그룹 첫 탭 바로 앞은 그 그룹 라벨의 앞자리
                    to < others.length ? { groupId: nextGroup, isLabel: !!nextGroup && prevGroup !== nextGroup } : null,
                    current,
                    isExpanded,
                );
            }
        }

        if (newIndex !== null) {
            others.splice(newIndex, 0, leaf);
            this.reorderHeaders(container, others);
        }

        if (newGroup === current) return false;
        if (newGroup) this.plugin.leafGroupMap.set(leaf, newGroup);
        else this.plugin.leafGroupMap.delete(leaf);
        return true;
    }

    // 💡 이 탭 바에서 선택된 탭 (Pane Relief 등은 선택된 탭을 옮김)
    activeLeafIn(container: Element, leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
        const header = container.querySelector('.workspace-tab-header.is-active');
        return leaves.find(l => (l as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl === header) ?? null;
    }

    leavesOf(container: Element): WorkspaceLeaf[] {
        const byHeader = new Map<Element, WorkspaceLeaf>();
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
            const header = (leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
            if (header) byHeader.set(header, leaf);
        });
        return Array.from(container.querySelectorAll('.workspace-tab-header'))
            .map(header => byHeader.get(header))
            .filter((leaf): leaf is WorkspaceLeaf => !!leaf);
    }

    // 💡 탭 헤더를 주어진 순서로 다시 꽂습니다. (내부 배열은 뒤이은 정렬이 DOM 순서에 맞춰 줌)
    reorderHeaders(container: Element, order: WorkspaceLeaf[]) {
        order.forEach(leaf => {
            const header = (leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
            if (header) container.appendChild(header);
        });
    }
}

// 💡 두 순서를 비교해 탭 하나만 자리를 옮겼으면 그 탭과 이전·새 위치를 돌려줍니다.
// 이웃한 두 탭이 맞바뀐 경우는 어느 쪽이 움직였는지 모호하므로 활성 탭을 기준으로 정합니다.
function findMovedLeaf(before: WorkspaceLeaf[], now: WorkspaceLeaf[], active: WorkspaceLeaf | null): LeafMove | null {
    if (before.length !== now.length) return null;
    let a = 0;
    while (a < now.length && before[a] === now[a]) a++;
    if (a === now.length) return null;
    let b = now.length - 1;
    while (before[b] === now[b]) b--;

    const same = (x: WorkspaceLeaf[], y: WorkspaceLeaf[]) => x.length === y.length && x.every((l, i) => l === y[i]);
    const movedLeft = before[b] === now[a] && same(before.slice(a, b), now.slice(a + 1, b + 1));
    const movedRight = before[a] === now[b] && same(before.slice(a + 1, b + 1), now.slice(a, b));
    const left = { leaf: now[a]!, from: b, to: a };
    const right = { leaf: now[b]!, from: a, to: b };

    if (movedLeft && movedRight) {
        if (active === left.leaf) return left;
        if (active === right.leaf) return right;
        return null;
    }
    if (movedLeft) return left;
    if (movedRight) return right;
    return null;
}

// 💡 start부터 step 방향으로 같은 그룹 탭이 이어지는 마지막 위치
function blockEdge(
    leaves: WorkspaceLeaf[],
    start: number,
    step: 1 | -1,
    groupId: string,
    groupOf: (l: WorkspaceLeaf | undefined) => string | null,
): number {
    let i = start;
    while (groupOf(leaves[i + step]) === groupId) i += step;
    return i;
}
