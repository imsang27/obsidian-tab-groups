import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { InternalTabs, internal } from './internal';
import { GroupSlot, resolveGroupAt } from './tab-group-rules';
import { setGroupColor } from './group-style';

// ✨ Vertical Tabs 목록에서 탭 줄을 끌 때도 탭 바처럼 들어갈 자리에 빈 줄(플레이스홀더)을 보여 주고,
// 놓으면 그 자리에 놓습니다. 그룹에 들어가는 자리면 그 그룹 색으로 칠합니다. (그 플러그인의 강조색 선 대신)
// - 자리는 탭 바(tab-drag.ts)와 같게 커서로 정함: 그룹 머리줄과 탭 줄을 하나씩의 칸으로 보고, 커서가 가운데를 넘은 칸 뒤.
//   그룹은 탭 바와 같은 규칙(tab-group-rules.ts): 머리줄 바로 뒤는 그 그룹 맨 앞, 같은 그룹 탭 사이는 편입,
//   그룹 맨 끝 자리는 커서가 그룹 마지막 탭 줄 안이면 편입, 그 아래(다음 머리줄·탭 쪽)면 그룹 밖
// - 그 플러그인(dnd-kit, 포인터 이벤트)은 놓을 때 커서에 가장 가까운 줄 "앞"으로 탭을 옮기는데, 그룹 두 개가 붙어 있으면
//   한 그룹 끝·두 그룹 사이·다음 그룹 맨 앞을 나누지 못해서, 그 플러그인이 옮긴 뒤 빈 줄이 보여 준 자리로 다시 옮김
// - 빈 줄이 끼면 아래 줄이 밀리므로, 커서 위치는 끌기 시작 때 잰 줄 자리로 따짐

const VIEW_SELECTOR = '.workspace-leaf-content[data-type="vertical-tabs"]';
const DRAGGED_SELECTOR = '.tree-item.is-tab.is-being-dragged[data-id]';
// 💡 편집 영역의 창 줄 (양옆 사이드바 줄은 뺌)
const PANE_SELECTOR = '.tree-item.is-group:not(.is-sidebar)';

interface Rect {
    top: number;
    bottom: number;
}

// 💡 목록의 한 칸: 그룹 머리줄 또는 탭 줄
interface Item {
    el: Element;
    rect: Rect;
    leaf: WorkspaceLeaf | null;
    groupId: string | null;
    isHeader: boolean;
}

interface VerticalSlot {
    leaf: WorkspaceLeaf;
    pane: InternalTabs;
    // 💡 끄는 탭을 뺀 탭들 사이의 자리
    index: number;
    groupId: string | null;
    // 💡 빈 줄을 끼울 자리 (이 칸 앞, 없으면 after 칸 뒤)
    next: Element | null;
    after: Element | null;
}

export class VerticalTabsDrag {
    placeholderEl: HTMLElement;
    // 💡 끌기 시작 때 잰 자리 (탭 줄은 탭 ID, 머리줄은 그룹 ID, 창 줄은 요소로)
    rects = new Map<string | Element, Rect>();
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
        // 💡 그 플러그인보다 먼저(캡처) 놓은 자리를 정해 둠. 그 플러그인은 같은 놓기에서 바로 탭을 옮김
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

        const leaf = this.leafById(dragged.getAttribute('data-id'));
        this.slot = leaf ? this.slotAt(leaf, view) : null;
        // 그 플러그인의 강조색 선 대신 빈 줄로 보여 줌 (styles.css)
        document.body.toggleClass('tab-group-vt-dropping', !!this.slot);
        this.show();
    }

    measure(view: HTMLElement) {
        this.placeholderEl.remove();
        const rect = (el: Element): Rect => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
        };
        view.querySelectorAll(PANE_SELECTOR).forEach(el => this.rects.set(el, rect(el)));
        view.querySelectorAll('.tree-item.is-tab[data-id]').forEach(el => this.rects.set(`tab:${el.getAttribute('data-id')}`, rect(el)));
        view.querySelectorAll('.tab-group-vt-header').forEach(el => this.rects.set(`group:${el.getAttribute('data-group-id')}`, rect(el)));
        this.scrollTop = this.scroller(view).scrollTop;
    }

    // 💡 끌기 시작 때 잰 자리를 지금 스크롤만큼 옮긴 위·아래
    rectOf(key: string | Element, view: HTMLElement): Rect | null {
        const rect = this.rects.get(key);
        if (!rect) return null;
        const shift = this.scroller(view).scrollTop - this.scrollTop;
        return { top: rect.top - shift, bottom: rect.bottom - shift };
    }

    scroller(view: HTMLElement): HTMLElement {
        return view.querySelector<HTMLElement>('.obsidian-vertical-tabs-container') ?? view;
    }

    leafById(id: string | null): WorkspaceLeaf | null {
        let found: WorkspaceLeaf | null = null;
        if (id) this.plugin.app.workspace.iterateAllLeaves(l => { if (!found && internal(l).id === id) found = l; });
        return found;
    }

    // 💡 커서가 있는 창 줄에서, 끄는 탭을 뺀 칸들 사이의 자리 (탭 바 updatePlaceholder·dropGroup과 같은 계산)
    slotAt(leaf: WorkspaceLeaf, view: HTMLElement): VerticalSlot | null {
        const plugin = this.plugin;
        const y = this.pointerY;
        const paneEl = Array.from(view.querySelectorAll(PANE_SELECTOR)).find(el => {
            const r = this.rectOf(el, view);
            return r && y >= r.top && y < r.bottom;
        });
        if (!paneEl) return null;

        const items: Item[] = [];
        paneEl.querySelectorAll('.tab-group-vt-header, .tree-item.is-tab[data-id]').forEach(el => {
            const isHeader = el.classList.contains('tab-group-vt-header');
            const id = el.getAttribute(isHeader ? 'data-group-id' : 'data-id');
            const rect = this.rectOf(`${isHeader ? 'group' : 'tab'}:${id}`, view);
            if (!rect || rect.bottom <= rect.top) return; // 접힌 그룹의 숨은 탭 줄
            const itemLeaf = isHeader ? null : this.leafById(id);
            if (itemLeaf === leaf) return;
            items.push({ el, rect, leaf: itemLeaf, groupId: isHeader ? id : itemLeaf ? plugin.leafGroupMap.get(itemLeaf) ?? null : null, isHeader });
        });
        const firstLeaf = items.find(item => item.leaf)?.leaf ?? null;
        const pane = firstLeaf ? internal(firstLeaf).parent : internal(leaf).parent;
        if (!pane) return null;

        const nextAt = items.findIndex(item => y < (item.rect.top + item.rect.bottom) / 2);
        const next = nextAt === -1 ? null : items[nextAt]!;
        const prev = nextAt === -1 ? items[items.length - 1] ?? null : items[nextAt - 1] ?? null;

        // 💡 놓을 자리 = 다음 칸의 탭 앞 (머리줄이면 그 그룹 첫 탭 앞, 접힌 그룹도 숨은 탭까지 셈)
        const others = pane.children.filter(l => l !== leaf);
        const nextLeaf = next?.leaf ?? (next?.isHeader ? others.find(l => plugin.leafGroupMap.get(l) === next.groupId) : undefined);
        const index = nextLeaf ? others.indexOf(nextLeaf) : others.length;

        const slot = (item: Item | null): GroupSlot | null => item && { groupId: item.groupId, isLabel: item.isHeader };
        const isExpanded = (groupId: string) => plugin.isGroupExpanded(groupId);
        const current = plugin.leafGroupMap.get(leaf) ?? null;
        // 🎯 펼쳐진 그룹 맨 끝 자리: 커서가 그룹 마지막 탭 줄 안이면 편입, 그 아래면 그룹 밖 (탭 바와 같음)
        const prevGroup = prev && !prev.isHeader ? prev.groupId : null;
        const atGroupEnd = !!prevGroup && isExpanded(prevGroup) && (!next || next.isHeader || next.groupId !== prevGroup);
        const groupId = atGroupEnd
            ? (prev && y < prev.rect.bottom ? prevGroup : null)
            : resolveGroupAt(slot(prev), slot(next), current, isExpanded);

        return { leaf, pane, index, groupId, next: next?.el ?? null, after: next ? null : prev?.el ?? null };
    }

    show() {
        const slot = this.slot;
        const el = this.placeholderEl;
        // 💡 제자리이고 그룹도 그대로면 보여 주지 않음
        const from = slot ? slot.pane.children.indexOf(slot.leaf) : -1;
        const current = slot ? this.plugin.leafGroupMap.get(slot.leaf) ?? null : null;
        if (!slot || (from === slot.index && slot.groupId === current)) {
            el.remove();
            return;
        }
        const color = slot.groupId ? this.plugin.groups.get(slot.groupId)?.color : undefined;
        el.toggleClass('is-in-group', !!color);
        if (color) setGroupColor(el, color);
        el.style.setProperty('--tab-group-placeholder-height', `${this.rowHeight()}px`);
        if (slot.next) {
            if (el.nextSibling !== slot.next) slot.next.parentElement?.insertBefore(el, slot.next);
        } else if (slot.after && el.previousSibling !== slot.after) {
            slot.after.parentElement?.insertBefore(el, slot.after.nextSibling);
        }
    }

    rowHeight(): number {
        const row = document.querySelector(`${VIEW_SELECTOR} ${DRAGGED_SELECTOR} > .tree-item-self`);
        return row?.getBoundingClientRect().height || 28;
    }

    // 💡 놓음: 정한 그룹을 바로 맞추고(그 플러그인이 곧 옮김), 옮긴 뒤 빈 줄이 보여 준 자리로 다시 놓음
    drop() {
        const slot = this.slot;
        const shown = !!this.placeholderEl.parentElement;
        this.finish();
        if (!slot || !shown) return;
        const plugin = this.plugin;
        const before = plugin.leafGroupMap.get(slot.leaf) ?? null;
        this.applyGroup(slot);
        window.setTimeout(() => {
            this.place(slot);
            plugin.tabMoves.expectedDrop = null;
            plugin.enforcePhysicalSorting({ trackMoves: false });
            if (slot.groupId !== before) void plugin.saveSettings();
        }, 0);
    }

    applyGroup(slot: VerticalSlot) {
        const plugin = this.plugin;
        if (slot.groupId) plugin.leafGroupMap.set(slot.leaf, slot.groupId);
        else plugin.leafGroupMap.delete(slot.leaf);
        // 💡 옮긴 뒤 정리(tab-move.ts의 applyMove)가 단축키 규칙 대신 이 그룹을 쓰게 함
        plugin.tabMoves.expectedDrop = { leaf: slot.leaf, groupId: slot.groupId };
    }

    // 💡 그 플러그인이 옮긴 자리가 빈 줄 자리와 다르면 옵시디언 기본 탭 옮기기와 같은 순서로 다시 옮김
    place(slot: VerticalSlot) {
        const leaf = internal(slot.leaf);
        const source = leaf.parent;
        if (source === slot.pane && slot.pane.children.indexOf(slot.leaf) === slot.index) return;
        this.applyGroup(slot);
        source?.removeChild(slot.leaf);
        slot.pane.insertChild(slot.index, slot.leaf);
        (slot.pane as InternalTabs & { selectTabIndex?(i: number): void }).selectTabIndex?.(slot.index);
        (this.plugin.app.workspace as unknown as { requestResize?(): void }).requestResize?.();
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
