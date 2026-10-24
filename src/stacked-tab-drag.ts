import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { InternalTabs, internal } from './internal';
import { droppedGroup } from './tab-move';
import { setGroupColor } from './group-style';

// ✨ 쌓인 탭(Stacked tabs) 모드에서 탭 막대 하나를 끌 때, 탭 바처럼 들어갈 자리에 빈 막대(플레이스홀더)를 끼워 보여 줍니다.
// 놓으면 그룹에 들어가는 자리면 그 그룹 색으로 칠합니다. (규칙은 놓은 뒤 그룹을 정하는 tab-move.ts의 droppedGroup과 같음)
// - 자리는 옵시디언과 같게 정함: 위쪽 띠·아래 1/3은 분할, 나머지는 커서 x로 막대 사이 (getDropDirection·getTabInsertLocation)
// - 옵시디언은 막대를 앞 막대들 너비의 합(left)·뒤 막대들 너비의 합(right) 자리에 붙여 두므로(updateSlidingTabs),
//   빈 막대를 끼운 뒤 막대 자리를 빈 막대 너비까지 넣어 다시 매깁니다.
// - 옮기기는 옵시디언이 끌기 끝에 막대 위치를 다시 재서 하므로, 그 전에(놓기·끌기 끝) 빈 막대를 빼고 자리를 되돌립니다.
// - 펼쳐진 그룹의 맨 끝 자리는 탭 바처럼 커서로 나눔: 그룹 마지막 탭(막대·화면) 위면 편입, 다음 막대에 가까우면 그룹 밖
//   (옵시디언은 소속을 모르므로 놓은 자리의 그룹을 기억해 두었다가 끌기 끝에 맞춤, tab-drag.ts)

// 💡 옵시디언 비공개 API: 탭 묶음의 DOM, 커서 x로 탭을 끼울 위치, 막대 자리 다시 매기기
interface StackedTabs extends InternalTabs {
    containerEl: HTMLElement;
    tabsContainerEl?: HTMLElement;
    tabHeaderContainerEl?: HTMLElement;
    getTabInsertLocation?(clientX: number): { index: number };
    updateSlidingTabs?(): void;
}
interface DragManager {
    overlayEl?: HTMLElement;
}

// 💡 탭 막대 하나를 놓을 자리: 탭 묶음, 끄는 탭의 지금 자리(다른 탭 묶음에서 왔으면 -1), 다른 탭들 사이의 위치, 들어갈 그룹
export interface StackedTabSlot {
    tabs: StackedTabs;
    from: number;
    index: number;
    groupId: string | null;
}

const OVERLAY_HIDDEN = 'tab-group-overlay-hidden';

export class StackedTabDrag {
    placeholderEl: HTMLElement;
    // 💡 빈 막대를 끼운 탭 묶음 (뺄 때 막대 자리를 되돌림)
    tabs: StackedTabs | null = null;
    // 💡 마지막으로 보여 준 자리, 그리고 그 자리에 놓았을 때의 자리 (끌기 끝에 그룹 소속을 맞출 때 씀)
    slot: StackedTabSlot | null = null;
    dropped: StackedTabSlot | null = null;

    constructor(private plugin: TabGroupsPlugin) {
        this.placeholderEl = createDiv({ cls: 'tab-group-stacked-placeholder' });
    }

    // 💡 끄는 동안: 빈 막대를 뺀 배치로 자리를 재고, 그 자리에 다시 끼웁니다. (제자리면 끼우지 않음)
    update(e: DragEvent, leaf: WorkspaceLeaf) {
        // 커서가 빈 막대 위면 빼기 전에 어느 탭 묶음인지 찾아 둠
        const tabsEl = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-tabs.mod-stacked') ?? null;
        this.clear();
        const slot = tabsEl ? this.slotAt(e, leaf, tabsEl) : null;
        this.slot = slot;
        // 옵시디언 드롭 선 대신 빈 막대로 보여 줌
        this.overlayEl()?.toggleClass(OVERLAY_HIDDEN, !!slot);
        // 제자리여도 그룹에서 빠지거나 들어가면 보여 줌
        const current = this.plugin.leafGroupMap.get(leaf) ?? null;
        if (slot && (slot.index !== slot.from || slot.groupId !== current)) this.show(slot, leaf);
    }

    slotAt(e: DragEvent, leaf: WorkspaceLeaf, tabsEl: HTMLElement): StackedTabSlot | null {
        const plugin = this.plugin;
        let found: StackedTabs | null = null;
        plugin.app.workspace.iterateAllLeaves(l => {
            const parent = internal(l).parent as StackedTabs | null;
            if (!found && parent?.containerEl === tabsEl) found = parent;
        });
        const tabs = found as StackedTabs | null;
        if (!tabs?.getTabInsertLocation) return null;

        const rect = tabsEl.getBoundingClientRect();
        const headerHeight = tabs.tabHeaderContainerEl?.getBoundingClientRect().height ?? 0;
        if (e.clientY - rect.top <= headerHeight) return null; // 위쪽 탭 바 줄은 탭 바 끌기(tab-drag.ts)나 옵시디언 분할
        if ((rect.bottom - e.clientY) / rect.height < 0.33) return null;

        const from = tabs.children.indexOf(leaf);
        let index = tabs.getTabInsertLocation(e.clientX).index;
        if (from !== -1 && index > from) index--;
        const others = tabs.children.filter(l => l !== leaf);
        const groupOf = (l: WorkspaceLeaf | undefined) => (l && plugin.leafGroupMap.get(l)) ?? null;
        const current = groupOf(leaf);
        const isExpanded = (groupId: string) => plugin.isGroupExpanded(groupId);
        const prevGroup = groupOf(others[index - 1]);
        const next = others[index];
        let groupId: string | null;
        if (from === index && current !== prevGroup && prevGroup) {
            // 🎯 그룹 바로 뒤의 다른 탭을 제자리에서 끔: 커서가 제 막대·화면 위면 그대로, 그 앞 그룹 마지막 탭 위면 편입 (탭 바와 같음)
            const ownLeft = internal(leaf).tabHeaderEl?.getBoundingClientRect().left ?? -Infinity;
            groupId = !current && isExpanded(prevGroup) && e.clientX < ownLeft ? prevGroup : current;
        } else if (prevGroup && isExpanded(prevGroup) && groupOf(next) !== prevGroup) {
            // 🎯 펼쳐진 그룹의 맨 끝: 다음 막대(없으면 탭 묶음 끝) 앞 막대 하나 너비 안쪽이면 그룹 밖, 그 앞이면 편입
            const width = internal(leaf).tabHeaderEl?.offsetWidth || 40;
            const nextHeader = next ? internal(next).tabHeaderEl : null;
            const lastPage = internal(tabs.children[tabs.children.length - 1]!).containerEl.getBoundingClientRect().right;
            const end = nextHeader ? nextHeader.getBoundingClientRect().left : Math.min(rect.right, lastPage);
            // 화면이 가려져 막대끼리 붙어 있어도 그룹 마지막 막대 위(오른쪽 절반)면 편입 (탭 바와 같음)
            const prevRight = internal(others[index - 1]!).tabHeaderEl?.getBoundingClientRect().right ?? -Infinity;
            groupId = e.clientX < Math.max(end - width, prevRight) ? prevGroup : null;
        } else {
            groupId = from === index ? current : droppedGroup(others, index, current, groupOf, isExpanded);
        }
        return { tabs, from, index, groupId };
    }

    show(slot: StackedTabSlot, leaf: WorkspaceLeaf) {
        const { tabs } = slot;
        const before = tabs.children.filter(l => l !== leaf)[slot.index];
        const container = tabs.tabsContainerEl;
        if (!container) return;

        const el = this.placeholderEl;
        const width = internal(leaf).tabHeaderEl?.offsetWidth || 40;
        el.style.setProperty('--tab-group-placeholder-width', `${width}px`);
        const color = slot.groupId ? this.plugin.groups.get(slot.groupId)?.color : undefined;
        el.toggleClass('is-in-group', !!color);
        if (color) setGroupColor(el, color);
        container.insertBefore(el, before ? internal(before).tabHeaderEl ?? null : null);
        this.tabs = tabs;

        // 💡 막대 자리를 빈 막대까지 넣어 다시 매김 (옵시디언 updateSlidingTabs와 같은 계산)
        const at = before ? tabs.children.indexOf(before) : tabs.children.length;
        const headers = tabs.children.map(l => internal(l).tabHeaderEl);
        const total = headers.reduce((sum, header) => sum + (header?.offsetWidth ?? 0), width);
        let left = 0;
        const place = (target: HTMLElement, w: number) => {
            target.style.left = `${left}px`;
            left += w;
            target.style.right = `${total - left}px`;
        };
        tabs.children.forEach((l, i) => {
            if (i === at) place(el, width);
            const header = headers[i];
            if (!header) return;
            place(header, header.offsetWidth);
            internal(l).containerEl.style.left = `${left}px`;
        });
        if (at === tabs.children.length) place(el, width);
    }

    // 💡 빈 막대를 빼고 막대 자리를 옵시디언 계산대로 되돌림
    clear() {
        if (this.placeholderEl.parentElement) this.placeholderEl.remove();
        this.tabs?.updateSlidingTabs?.();
        this.tabs = null;
    }

    finish() {
        this.clear();
        this.slot = null;
        this.overlayEl()?.removeClass(OVERLAY_HIDDEN);
    }

    // 💡 막대 사이에 놓음: 끌기 끝에 소속을 맞추도록 자리를 기억 (Esc로 취소하면 놓기가 없어 그대로)
    drop(): StackedTabSlot | null {
        this.dropped = this.slot;
        this.finish();
        return this.dropped;
    }

    takeDropped(): StackedTabSlot | null {
        const dropped = this.dropped;
        this.dropped = null;
        return dropped;
    }

    overlayEl(): HTMLElement | null {
        return (this.plugin.app as unknown as { dragManager?: DragManager }).dragManager?.overlayEl ?? null;
    }
}
