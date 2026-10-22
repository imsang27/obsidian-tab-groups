import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import type { TabGroupData } from './main';
import { setGroupColor } from './group-style';
import { internal } from './internal';
import { openEditGroup } from './group-actions';
import { StackedTabsParent, isStackedContainer, setStackedOrder } from './stacked-order';

// ✨ 쌓인 탭(Stacked tabs) 모드: 탭 머리가 탭 바가 아니라 화면 사이(.workspace-tab-container)의 세로 막대가 됩니다.
// - 그룹 첫 막대 맨 위에 라벨 (누르면 접기·펼치기, 우클릭하면 그룹 창)
// - 접은 그룹은 라벨이 있는 첫 막대만 남기고, 나머지 막대와 그룹 탭의 화면을 숨깁니다.
//   옵시디언은 막대 위치를 앞 막대들의 너비를 더해 정하므로(숨은 막대는 0), 숨긴 뒤 위치를 다시 계산하게 합니다.
// - 탭 순서가 바뀌면 탭 바처럼 그룹 편입·이탈(tab-move.ts)과 그룹 탭 모으기를 합니다. (group-layout.ts가 부름)
const HEADER_MARKS = ['tab-group-stacked-collapsed', 'tab-group-stacked-hidden'];
const HIDDEN = 'tab-group-stacked-hidden';

export class StackedTabs {
    constructor(private plugin: TabGroupsPlugin) {}

    containers(): HTMLElement[] {
        const containers = new Set<HTMLElement>();
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
            const container = internal(leaf).tabHeaderEl?.parentElement;
            if (container && isStackedContainer(container)) containers.add(container);
        });
        return [...containers];
    }

    // 💡 그룹 탭이 붙어 있게 순서를 맞춥니다. (그룹은 첫 탭 자리에 모음)
    gather(container: HTMLElement) {
        const plugin = this.plugin;
        const leaves = plugin.tabMoves.leavesOf(container);
        const order: WorkspaceLeaf[] = [];
        leaves.forEach(leaf => {
            if (order.includes(leaf)) return;
            const groupId = plugin.leafGroupMap.get(leaf);
            if (groupId) order.push(...leaves.filter(l => plugin.leafGroupMap.get(l) === groupId));
            else order.push(leaf);
        });
        if (order.some((leaf, i) => leaf !== leaves[i])) setStackedOrder(order);
    }

    // 💡 쌓인 탭 묶음마다 라벨과 접힘을 그리고, 일반 탭 바로 돌아간 탭에 남은 표시는 지웁니다.
    renderAll() {
        const stacked = new Set(this.containers());
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
            const header = internal(leaf).tabHeaderEl;
            if (header && !stacked.has(header.parentElement as HTMLElement)) clearStackedMarks(leaf);
        });
        stacked.forEach(container => this.render(container));
    }

    render(container: HTMLElement) {
        const plugin = this.plugin;
        // 💡 일반 모드일 때 위쪽 탭 바에 그려 둔 라벨은 치움
        container.parentElement?.querySelectorAll('.workspace-tab-header-container-inner > .tab-group-label').forEach(el => el.remove());

        const groups = new Map<string, WorkspaceLeaf[]>();
        plugin.tabMoves.leavesOf(container).forEach(leaf => {
            clearStackedMarks(leaf);
            internal(leaf).tabHeaderEl?.removeClasses(['tab-group-hidden', 'tab-group-first', 'tab-group-last']);
            const groupId = plugin.leafGroupMap.get(leaf);
            if (!groupId) return;
            if (!groups.has(groupId)) groups.set(groupId, []);
            groups.get(groupId)!.push(leaf);
        });

        groups.forEach((leaves, groupId) => {
            const groupData = plugin.groups.get(groupId);
            const first = internal(leaves[0]!).tabHeaderEl;
            const last = internal(leaves[leaves.length - 1]!).tabHeaderEl;
            if (!groupData || !first || !last) return;
            first.addClass('tab-group-first');
            last.addClass('tab-group-last');
            first.querySelector('.workspace-tab-header-inner')?.prepend(this.label(groupId, groupData, leaves.length));
            if (!groupData.isCollapsed) return;
            // 💡 접은 그룹: 첫 막대는 라벨만 보이게 남기고, 나머지 막대와 그룹 탭의 화면은 숨김
            first.addClass('tab-group-stacked-collapsed');
            leaves.forEach((leaf, i) => {
                if (i > 0) internal(leaf).tabHeaderEl?.addClass(HIDDEN);
                internal(leaf).containerEl.addClass(HIDDEN);
            });
        });

        // 💡 숨긴 막대를 빼고 막대 위치를 다시 계산하게 함
        const parent = plugin.tabMoves.leavesOf(container)[0];
        (parent ? internal(parent).parent as unknown as StackedTabsParent | null : null)?.updateSlidingTabs?.();
    }

    // 💡 라벨: 탭 바의 라벨과 같은 일 (누르면 접기·펼치기, 우클릭하면 그룹 창). 막대 클릭(탭 고르기)으로 넘어가지 않게 막음
    label(groupId: string, groupData: TabGroupData, count: number): HTMLElement {
        const plugin = this.plugin;
        const label = createDiv({ cls: 'tab-group-stacked-label' });
        label.setAttribute('data-group-id', groupId);
        label.toggleClass('is-collapsed', groupData.isCollapsed);
        label.toggleClass('is-empty', !groupData.name);
        setGroupColor(label, groupData.color);
        if (groupData.name) label.createSpan({ cls: 'tab-group-label-name', text: groupData.name });
        const showCount = plugin.settings.labelTabCount === 'all' || (plugin.settings.labelTabCount === 'collapsed' && groupData.isCollapsed);
        if (showCount) {
            if (groupData.name) label.createSpan({ cls: 'tab-group-label-separator', text: '·', attr: { 'aria-hidden': 'true' } });
            label.createSpan({ cls: 'tab-group-label-count', text: String(count) });
        }
        label.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            void plugin.labels.toggleCollapsed(groupId, groupData);
        });
        label.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditGroup(plugin, groupId);
        });
        return label;
    }

    // 💡 플러그인을 끌 때
    unload() {
        this.plugin.app.workspace.iterateAllLeaves(leaf => clearStackedMarks(leaf));
    }
}

// 💡 탭 하나에서 쌓인 탭용 표시(라벨·접힘·숨김)를 걷어 냅니다.
function clearStackedMarks(leaf: WorkspaceLeaf) {
    const header = internal(leaf).tabHeaderEl;
    header?.querySelectorAll('.tab-group-stacked-label').forEach(el => el.remove());
    header?.removeClasses(HEADER_MARKS);
    internal(leaf).containerEl.removeClass(HIDDEN);
}
