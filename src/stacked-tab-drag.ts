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

    constructor(private plugin: TabGroupsPlugin) {
        this.placeholderEl = createDiv({ cls: 'tab-group-stacked-placeholder' });
    }

    // 💡 끄는 동안: 빈 막대를 뺀 배치로 자리를 재고, 그 자리에 다시 끼웁니다. (제자리면 끼우지 않음)
    update(e: DragEvent, leaf: WorkspaceLeaf) {
        // 커서가 빈 막대 위면 빼기 전에 어느 탭 묶음인지 찾아 둠
        const tabsEl = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-tabs.mod-stacked') ?? null;
        this.clear();
        const slot = tabsEl ? this.slotAt(e, leaf, tabsEl) : null;
        // 옵시디언 드롭 선 대신 빈 막대로 보여 줌
        this.overlayEl()?.toggleClass(OVERLAY_HIDDEN, !!slot);
        if (slot && slot.index !== slot.from) this.show(slot, leaf);
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
        const groupId = from === index
            ? current
            : droppedGroup(others, index, current, groupOf, groupId => plugin.isGroupExpanded(groupId));
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
        this.overlayEl()?.removeClass(OVERLAY_HIDDEN);
    }

    overlayEl(): HTMLElement | null {
        return (this.plugin.app as unknown as { dragManager?: DragManager }).dragManager?.overlayEl ?? null;
    }
}
