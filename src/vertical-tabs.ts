import type TabGroupsPlugin from './main';
import { setGroupColor } from './group-style';
import { internal } from './internal';
import { openEditGroup } from './group-actions';

// ✨ Vertical Tabs 플러그인과 함께 쓸 때: 그 플러그인의 세로 탭 목록에도 그룹을 보여 줍니다.
// 목록의 탭 줄(.tree-item.is-tab)에는 탭 ID(data-id)가 붙어 있어, 같은 그룹의 탭 줄에 그룹 색을 칠하고
// 그룹 첫 탭 위에 머리줄(라벨처럼 누르면 접기·펼치기, 우클릭하면 그룹 창)을 끼워 넣습니다. 접힌 그룹의 탭 줄은 숨김.
// 💡 목록은 그 플러그인(React)이 다시 그리므로, 바뀔 때마다 표시를 다시 붙입니다. (우리가 붙이는 동안은 감시를 멈춰 되풀이하지 않음)
const VIEW_SELECTOR = '.workspace-leaf-content[data-type="vertical-tabs"]';
const TAB_SELECTOR = '.tree-item.is-tab[data-id]';
const MEMBER_CLASSES = ['tab-group-vt-member', 'tab-group-vt-first', 'tab-group-vt-last', 'tab-group-vt-hidden'];

export class VerticalTabsCompat {
    private observers = new Map<HTMLElement, MutationObserver>();
    // 💡 세로 목록을 다시 그리게 했던 탭 순서 (refreshIfStale)
    private refreshedOrder: string | null = null;

    constructor(private plugin: TabGroupsPlugin) {}

    // 💡 지금 열린 Vertical Tabs 목록마다 감시자를 달고 표시를 붙입니다. (탭 바를 정리할 때마다 불림)
    render() {
        const views = new Set<HTMLElement>();
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
            const view = internal(leaf).containerEl.querySelector<HTMLElement>(VIEW_SELECTOR);
            if (view) views.add(view);
        });
        this.observers.forEach((observer, view) => {
            if (views.has(view)) return;
            observer.disconnect();
            this.observers.delete(view);
        });
        views.forEach(view => {
            if (!this.observers.has(view)) {
                // 💡 끄는 동안 끼운 빈 줄(vertical-tabs-drag.ts)만 바뀐 건 무시 (다시 그리면 빈 줄 자리가 또 바뀌어 되풀이됨)
                const observer = new MutationObserver(mutations => {
                    const placeholder = this.plugin.verticalTabsDrag.placeholderEl;
                    const onlyPlaceholder = mutations.every(m => m.target === placeholder
                        || [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)].every(n => n === placeholder) && m.type === 'childList');
                    if (!onlyPlaceholder) this.apply(view);
                });
                this.observers.set(view, observer);
            }
            this.apply(view);
        });
        this.refreshIfStale(views);
    }

    // 💡 세로 목록의 탭 순서가 실제 순서와 다르면 그 플러그인이 다시 그리게 함 (화면 정리 신호를 보냄)
    // Pane Relief의 "n번째 자리로 옮기기" 등은 신호 없이 순서만 바꿔서 목록이 그대로 남음
    // 같은 순서로는 한 번만 보냄 (그 플러그인이 아직 다시 그리기 전에 또 불려도 되풀이하지 않게)
    private refreshIfStale(views: Set<HTMLElement>) {
        const leafById = this.leavesById();
        if (![...views].some(view => this.isStale(view, leafById))) {
            this.refreshedOrder = null;
            return;
        }
        const order = [...leafById.keys()].join();
        if (order === this.refreshedOrder) return;
        this.refreshedOrder = order;
        window.setTimeout(() => this.plugin.app.workspace.trigger('layout-change'), 0);
    }

    // 💡 같은 창(그 플러그인의 그룹 줄) 안에서 이웃한 두 탭 줄이 실제 탭 순서와 거꾸로인지
    private isStale(view: HTMLElement, leafById: Map<string, ReturnType<typeof internal>>): boolean {
        const items = Array.from(view.querySelectorAll(TAB_SELECTOR));
        return items.some((item, i) => {
            const prev = items[i - 1];
            if (!prev || prev.parentElement?.closest('.tree-item.is-group') !== item.parentElement?.closest('.tree-item.is-group')) return false;
            const a = leafById.get(prev.getAttribute('data-id') ?? '');
            const b = leafById.get(item.getAttribute('data-id') ?? '');
            const children = a?.parent?.children;
            if (!a || !b || !children || b.parent !== a.parent) return false;
            return children.indexOf(a as never) > children.indexOf(b as never);
        });
    }

    private leavesById() {
        const leafById = new Map<string, ReturnType<typeof internal>>();
        // 💡 콜백이 참 값을 돌려주면 순회가 멈추므로 중괄호로 감쌈
        this.plugin.app.workspace.iterateAllLeaves(leaf => { leafById.set(internal(leaf).id, internal(leaf)); });
        return leafById;
    }

    apply(view: HTMLElement) {
        const observer = this.observers.get(view);
        observer?.disconnect();
        try {
            this.decorate(view);
            this.plugin.verticalTabsDrag.schedule();
        } finally {
            // 💡 그 플러그인이 다시 그릴 때 탭 줄의 class·style을 덮어써서, 속성이 바뀌는 것도 봄
            observer?.observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        }
    }

    private decorate(view: HTMLElement) {
        const plugin = this.plugin;
        view.querySelectorAll('.tab-group-vt-header').forEach(el => el.remove());

        const leafById = this.leavesById();
        const groupOf = (item: Element) => {
            const leaf = leafById.get(item.getAttribute('data-id') ?? '');
            return leaf ? plugin.leafGroupMap.get(leaf as never) ?? null : null;
        };

        const items = Array.from(view.querySelectorAll<HTMLElement>(TAB_SELECTOR));
        items.forEach((item, i) => {
            const groupId = groupOf(item);
            const group = groupId ? plugin.groups.get(groupId) : undefined;
            if (!groupId || !group) {
                item.removeClasses(MEMBER_CLASSES);
                item.style.removeProperty('--tab-group-color');
                return;
            }
            // 💡 바로 앞·뒤 탭 줄이 같은 창(그 플러그인의 그룹)에 있고 같은 그룹인지 (그룹 탭은 늘 붙어 있음)
            // 탭 줄마다 감싸는 요소가 따로 있어서, 부모가 아니라 그 플러그인의 그룹 줄(.tree-item.is-group)로 비교
            const pane = (el: Element) => el.parentElement?.closest('.tree-item.is-group') ?? null;
            const prev = items[i - 1], next = items[i + 1];
            const first = !prev || pane(prev) !== pane(item) || groupOf(prev) !== groupId;
            const last = !next || pane(next) !== pane(item) || groupOf(next) !== groupId;
            item.addClass('tab-group-vt-member');
            item.toggleClass('tab-group-vt-first', first);
            item.toggleClass('tab-group-vt-last', last);
            item.toggleClass('tab-group-vt-hidden', group.isCollapsed);
            setGroupColor(item, group.color);
            if (first) item.parentElement?.insertBefore(this.header(groupId), item);
        });
    }

    // 💡 그룹 머리줄: 탭 바의 라벨과 같은 일 (누르면 접기·펼치기, 우클릭하면 그룹 창)
    private header(groupId: string): HTMLElement {
        const plugin = this.plugin;
        const group = plugin.groups.get(groupId)!;
        const header = createDiv({ cls: 'tab-group-vt-header' });
        header.toggleClass('is-collapsed', group.isCollapsed);
        header.setAttribute('data-group-id', groupId);
        setGroupColor(header, group.color);
        const pill = header.createSpan({ cls: 'tab-group-vt-header-name', text: group.name });
        const count = plugin.groupLeaves(groupId).length;
        header.createSpan({ cls: 'tab-group-vt-header-count', text: String(count) });
        pill.toggleClass('is-empty', !group.name);
        header.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            void plugin.labels.toggleCollapsed(groupId, group);
        });
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditGroup(plugin, groupId);
        });
        return header;
    }

    unload() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        document.querySelectorAll('.tab-group-vt-header').forEach(el => el.remove());
        document.querySelectorAll<HTMLElement>(TAB_SELECTOR).forEach(item => {
            item.removeClasses(MEMBER_CLASSES);
            item.style.removeProperty('--tab-group-color');
        });
    }
}
