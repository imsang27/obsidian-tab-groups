import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { InternalTabs, internal } from './internal';
import { droppedGroup } from './tab-move';
import { setGroupColor } from './group-style';

// ✨ Vertical Tabs 목록에서 탭 줄을 끌 때도 탭 바처럼 들어갈 자리에 빈 줄(플레이스홀더)을 보여 주고,
// 놓으면 그룹에 들어가는 자리면 그 그룹 색으로 칠합니다. (그 플러그인의 강조색 선 대신)
// - 그 플러그인은 dnd-kit(포인터 이벤트)로 끌고, 커서에 가장 가까운 줄(.vt-is-being-dragged-over) "앞"에 놓습니다.
//   목록 끝의 "새 탭" 줄(또는 창 줄) 위면 그 창의 맨 끝입니다. 옮기기는 그 플러그인이 놓을 때 바로 합니다.
// - 들어갈 그룹은 탭 바와 같은 규칙(tab-move.ts의 droppedGroup)이고, 그룹 머리줄 바로 아래·그룹 맨 끝은 커서로 나눔:
//   그룹 첫 탭 앞은 커서가 머리줄 위면 그룹 밖, 첫 탭 위면 편입. 그룹 맨 끝은 커서가 다음 줄 위쪽 절반이면 편입, 아래쪽이면 그룹 밖
// - 빈 줄이 끼면 아래 줄이 밀리므로, 커서 위치는 끌기 시작 때 잰 줄 자리로 따짐 (그 플러그인도 시작 때 잰 자리로 판정)
// - 놓을 때 정한 그룹은 탭을 옮긴 뒤 정리(tab-move.ts의 applyMove)가 그대로 쓰게 넘김

const VIEW_SELECTOR = '.workspace-leaf-content[data-type="vertical-tabs"]';
const DRAGGED_SELECTOR = '.tree-item.is-tab.is-being-dragged[data-id]';
const OVER_SELECTOR = '.vt-is-being-dragged-over';

interface VerticalSlot {
    leaf: WorkspaceLeaf;
    // 💡 빈 줄을 끼울 자리 (이 요소 앞)
    before: Element;
    groupId: string | null;
}

export class VerticalTabsDrag {
    placeholderEl: HTMLElement;
    // 💡 끌기 시작 때 잰 줄 자리 (빈 줄이 끼어도 흔들리지 않게)
    rects = new Map<Element, DOMRect>();
    scrollTop = 0;
    pointerY = 0;
    slot: VerticalSlot | null = null;
    frame = 0;

    constructor(private plugin: TabGroupsPlugin) {
        this.placeholderEl = createDiv({ cls: 'tab-group-vt-placeholder' });
    }

    register() {
        const opts = { capture: true };
        this.plugin.registerDomEvent(window, 'pointermove', (e) => {
            this.pointerY = e.clientY;
            this.schedule();
        }, opts);
        // 💡 그 플러그인보다 먼저(캡처) 놓은 자리의 그룹을 정해 둠. 그 플러그인은 같은 놓기에서 바로 탭을 옮김
        this.plugin.registerDomEvent(window, 'pointerup', () => this.drop(), opts);
        this.plugin.registerDomEvent(window, 'pointercancel', () => this.finish(), opts);
        this.plugin.registerDomEvent(window, 'keydown', (e) => { if (e.key === 'Escape') this.finish(); }, opts);
    }

    // 💡 그 플러그인이 끄는 표시를 다시 그린 뒤에 맞추려고 다음 프레임에 (목록이 바뀔 때도 vertical-tabs.ts가 부름)
    schedule() {
        if (this.frame) return;
        this.frame = window.requestAnimationFrame(() => {
            this.frame = 0;
            this.update();
        });
    }

    update() {
        const dragged = document.querySelector<HTMLElement>(`${VIEW_SELECTOR} ${DRAGGED_SELECTOR}`);
        const view = dragged?.closest<HTMLElement>(VIEW_SELECTOR) ?? null;
        if (!dragged || !view) {
            if (this.rects.size > 0) this.finish();
            return;
        }
        if (this.rects.size === 0) this.measure(view);

        const leaf = this.leafOf(dragged);
        const over = view.querySelector(OVER_SELECTOR);
        this.slot = leaf && over ? this.slotAt(leaf, over, view) : null;
        // 그 플러그인의 강조색 선 대신 빈 줄로 보여 줌 (styles.css)
        document.body.toggleClass('tab-group-vt-dropping', !!this.slot);
        this.show(view);
    }

    measure(view: HTMLElement) {
        this.placeholderEl.remove();
        view.querySelectorAll('.tree-item').forEach(el => this.rects.set(el, el.getBoundingClientRect()));
        this.scrollTop = this.scroller(view)?.scrollTop ?? 0;
    }

    // 💡 끌기 시작 때 잰 자리를 지금 스크롤만큼 옮긴 위·아래
    rectOf(el: Element, view: HTMLElement): { top: number, bottom: number } | null {
        const rect = this.rects.get(el);
        if (!rect) return null;
        const shift = (this.scroller(view)?.scrollTop ?? 0) - this.scrollTop;
        return { top: rect.top - shift, bottom: rect.bottom - shift };
    }

    scroller(view: HTMLElement): HTMLElement | null {
        return view.querySelector<HTMLElement>('.obsidian-vertical-tabs-container') ?? view;
    }

    leafOf(row: Element): WorkspaceLeaf | null {
        const id = row.getAttribute('data-id');
        let found: WorkspaceLeaf | null = null;
        if (id) this.plugin.app.workspace.iterateAllLeaves(l => { if (!found && internal(l).id === id) found = l; });
        return found;
    }

    // 💡 놓을 자리: 탭 줄 위면 그 탭 앞, "새 탭" 줄·창 줄 위면 그 창의 맨 끝
    slotAt(leaf: WorkspaceLeaf, over: Element, view: HTMLElement): VerticalSlot | null {
        const plugin = this.plugin;
        const overLeaf = over.matches('.tree-item.is-tab[data-id]') ? this.leafOf(over) : null;
        if (overLeaf === leaf) return null;
        const pane = overLeaf ? internal(overLeaf).parent : this.paneOf(over);
        if (!pane) return null;

        const others = pane.children.filter(l => l !== leaf);
        const index = overLeaf ? others.indexOf(overLeaf) : others.length;
        const groupOf = (l: WorkspaceLeaf | undefined) => (l && plugin.leafGroupMap.get(l)) ?? null;
        const isExpanded = (groupId: string) => plugin.isGroupExpanded(groupId);
        const current = groupOf(leaf);
        const prevGroup = groupOf(others[index - 1]);
        const nextGroup = groupOf(others[index]);
        const rect = this.rectOf(over, view);
        const before = overLeaf ? over : over.matches('.is-slot') ? over : over.querySelector('.is-tab-slot') ?? over;

        let groupId: string | null;
        if (prevGroup && isExpanded(prevGroup) && nextGroup !== prevGroup) {
            // 🎯 그룹 맨 끝: 다음 줄 위쪽 절반이면 편입, 아래쪽이면 그룹 밖
            groupId = rect && this.pointerY < (rect.top + rect.bottom) / 2 ? prevGroup : null;
        } else if (nextGroup && isExpanded(nextGroup) && prevGroup !== nextGroup) {
            // 🎯 그룹 첫 탭 앞: 커서가 머리줄 위면 그룹 밖(머리줄 앞), 첫 탭 위면 편입(머리줄 뒤)
            groupId = rect && this.pointerY < rect.top ? null : nextGroup;
        } else {
            groupId = droppedGroup(others, index, current, groupOf, isExpanded);
        }
        // 그룹 밖으로 첫 탭 앞에 놓으면 빈 줄은 머리줄 앞에
        const header = before.previousElementSibling;
        const slotBefore = groupId !== nextGroup && header?.classList.contains('tab-group-vt-header') ? header : before;
        return { leaf, before: slotBefore, groupId };
    }

    // 💡 "새 탭" 줄이나 창 줄이 속한 창(탭 묶음)
    paneOf(el: Element): InternalTabs | null {
        const group = el.closest('.tree-item.is-group') ?? el;
        const row = group.querySelector('.tree-item.is-tab[data-id]:not(.is-being-dragged)') ?? group.querySelector('.tree-item.is-tab[data-id]');
        const leaf = row ? this.leafOf(row) : null;
        return leaf ? internal(leaf).parent : null;
    }

    show(view: HTMLElement) {
        const slot = this.slot;
        if (!slot) {
            this.placeholderEl.remove();
            return;
        }
        const el = this.placeholderEl;
        const color = slot.groupId ? this.plugin.groups.get(slot.groupId)?.color : undefined;
        el.toggleClass('is-in-group', !!color);
        if (color) setGroupColor(el, color);
        el.style.setProperty('--tab-group-placeholder-height', `${this.rowHeight(view)}px`);
        if (el.nextSibling !== slot.before) slot.before.parentElement?.insertBefore(el, slot.before);
    }

    rowHeight(view: HTMLElement): number {
        const row = view.querySelector(`${DRAGGED_SELECTOR} > .tree-item-self`);
        return row?.getBoundingClientRect().height || 28;
    }

    // 💡 놓음: 정한 그룹을 바로 맞추고(그 플러그인이 곧 옮김), 옮긴 뒤 정리가 같은 그룹을 쓰게 넘김
    drop() {
        const slot = this.slot;
        this.finish();
        if (!slot) return;
        const plugin = this.plugin;
        const current = plugin.leafGroupMap.get(slot.leaf) ?? null;
        if (slot.groupId) plugin.leafGroupMap.set(slot.leaf, slot.groupId);
        else plugin.leafGroupMap.delete(slot.leaf);
        plugin.tabMoves.expectedDrop = { leaf: slot.leaf, groupId: slot.groupId };
        // 💡 옮긴 자리가 그대로면(제자리) 정리가 이동을 못 보므로 여기서 마무리
        window.setTimeout(() => {
            if (plugin.tabMoves.expectedDrop?.leaf === slot.leaf) plugin.tabMoves.expectedDrop = null;
            plugin.enforcePhysicalSorting({ trackMoves: false });
            if (slot.groupId !== current) void plugin.saveSettings();
        }, 50);
    }

    finish() {
        if (this.frame) window.cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.placeholderEl.remove();
        this.rects.clear();
        this.slot = null;
        document.body.removeClass('tab-group-vt-dropping');
    }
}
