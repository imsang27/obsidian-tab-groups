import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';

const TAB_BAR_SELECTOR = '.workspace-tab-header-container';
const TAB_BAR_INNER_SELECTOR = '.workspace-tab-header-container-inner';

// 💡 옵시디언 비공개 API 중 이 파일이 쓰는 부분만 타입으로 정의 (옵시디언 기본 탭 드롭이 쓰는 것과 같은 메서드)
interface InternalTabs {
    children: WorkspaceLeaf[];
    removeChild(leaf: WorkspaceLeaf): void;
    insertChild(index: number, leaf: WorkspaceLeaf): void;
    selectTabIndex?(index: number): void;
}
interface InternalLeaf {
    parent: InternalTabs | null;
    tabHeaderEl?: HTMLElement;
    setDimension?(dimension: number | null): void;
}
const internal = (leaf: WorkspaceLeaf) => leaf as unknown as InternalLeaf;

// ✨ 탭 하나를 끌 때: 탭 바 안에서는 자리 표시(플레이스홀더)로 들어갈 위치를 보여 주고,
// 놓으면 그 자리에 옵시디언 내부 API로 탭을 옮깁니다. 탭 바 밖(분할·새 창)은 옵시디언 기본 동작에 맡깁니다.
export class TabDragController {
    plugin: TabGroupsPlugin;
    placeholderEl: HTMLElement;
    draggedLeaf: WorkspaceLeaf | null = null;
    draggedHeader: HTMLElement | null = null;
    draggedWidth = 0;

    constructor(plugin: TabGroupsPlugin) {
        this.plugin = plugin;
        this.placeholderEl = createDiv({ cls: 'tab-group-drag-placeholder' });
    }

    get isDragging(): boolean {
        return this.draggedLeaf !== null;
    }

    register() {
        const opts = { capture: true };
        this.plugin.registerDomEvent(window, 'dragstart', (e) => this.onDragStart(e), opts);
        this.plugin.registerDomEvent(window, 'dragover', (e) => this.onDragOver(e), opts);
        this.plugin.registerDomEvent(window, 'drop', (e) => this.onDrop(e), opts);
        this.plugin.registerDomEvent(window, 'dragend', () => this.onDragEnd(), opts);
    }

    onDragStart(e: DragEvent) {
        if (this.plugin.draggingGroupId) return;
        const header = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-tab-header');
        if (!header) return;
        const leaf = this.plugin.findLeafFromHeader(header);
        if (!leaf) return;

        this.draggedLeaf = leaf;
        this.draggedHeader = header;
        this.draggedWidth = header.getBoundingClientRect().width;
        // 💡 새 창 분리 방지: 탭 바 안쪽은 원래 창 이동 영역(-webkit-app-region: drag)이라,
        // 플레이스홀더나 그 여백에 놓으면 OS가 "창 밖에 놓음"으로 처리해 새 창이 열립니다.
        // 드래그하는 동안에는 탭 바 전체를 no-drag로 바꿉니다 (styles.css).
        document.body.classList.add('is-dragging-tab');
    }

    onDragOver(e: DragEvent) {
        if (!this.isDragging) return;

        const inner = this.findTabBarInner(e.target as HTMLElement);
        if (!inner) {
            // 💡 탭 바 밖: 분할 미리보기 등 옵시디언 기본 오버레이가 보이도록 우리 표시만 치웁니다.
            this.hidePlaceholder();
            return;
        }

        // 💡 탭 바 안: 옵시디언 기본 드롭 선(보라색 선)은 CSS로 숨기고 플레이스홀더만 보여 줍니다.
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        document.body.classList.add('is-dragging-tab-in-tab-bar');
        this.updatePlaceholder(inner, e.clientX);
    }

    onDrop(e: DragEvent) {
        const leaf = this.draggedLeaf;
        const inner = this.findTabBarInner(e.target as HTMLElement);
        if (!leaf || !inner) return; // 탭 바 밖 드롭은 옵시디언 기본 처리(분할 등)에 맡김

        // 💡 마지막 dragover가 늦게 처리돼도 놓은 좌표 그대로 자리를 한 번 더 맞춥니다.
        this.updatePlaceholder(inner, e.clientX);
        e.preventDefault();
        e.stopImmediatePropagation(); // 옵시디언이 같은 탭을 한 번 더 옮기지 않도록 차단

        const target = this.findTabsParent(inner);
        const groupChanged = this.applyDropGroup(leaf);
        if (target) {
            const index = this.getDropIndex(target, leaf);
            this.moveLeaf(leaf, target, index);
        }
        this.finishDrag();
        this.plugin.enforcePhysicalSorting();
        this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
        if (groupChanged) void this.plugin.saveSettings();
    }

    // ✨ 놓은 자리에 따라 그룹 소속을 정합니다. (플레이스홀더 양옆의 보이는 탭·라벨 기준)
    // - 펼쳐진 그룹의 라벨 바로 뒤, 또는 같은 그룹 탭 두 개 사이 → 그 그룹에 편입
    // - 자기 그룹의 맨 끝(앞은 같은 그룹 탭, 뒤는 다른 것) → 그대로 유지
    // - 그 밖의 자리 → 그룹에서 빠짐
    // 그룹이 바뀌었으면 true를 돌려줍니다.
    applyDropGroup(leaf: WorkspaceLeaf): boolean {
        const prev = this.neighbor('previousElementSibling');
        const next = this.neighbor('nextElementSibling');
        const isLabel = (el: Element | null) => !!el?.classList.contains('tab-group-label');
        const groupOf = (el: Element | null) =>
            el?.getAttribute('data-tab-group-id') ?? el?.getAttribute('data-group-id') ?? null;
        const isExpanded = (groupId: string | null) =>
            !!groupId && this.plugin.groups.get(groupId)?.isCollapsed === false;

        const current = this.plugin.leafGroupMap.get(leaf) ?? null;
        const prevGroup = groupOf(prev);
        const nextGroup = isLabel(next) ? null : groupOf(next);

        let newGroup: string | null = null;
        if (isLabel(prev) && isExpanded(prevGroup)) newGroup = prevGroup;
        else if (!isLabel(prev) && prevGroup && prevGroup === nextGroup) newGroup = prevGroup;
        else if (!isLabel(prev) && prevGroup && prevGroup === current) newGroup = current;

        if (newGroup === current) return false;
        if (newGroup) this.plugin.leafGroupMap.set(leaf, newGroup);
        else this.plugin.leafGroupMap.delete(leaf);
        return true;
    }

    // 💡 플레이스홀더 옆의 보이는 탭·라벨 (끌고 있는 탭과 접힌 탭은 건너뜀)
    neighbor(direction: 'previousElementSibling' | 'nextElementSibling'): Element | null {
        let el = this.placeholderEl[direction];
        while (el) {
            const isItem = el.classList.contains('workspace-tab-header') || el.classList.contains('tab-group-label');
            if (isItem && el !== this.draggedHeader && window.getComputedStyle(el).display !== 'none') return el;
            el = el[direction];
        }
        return null;
    }

    onDragEnd() {
        if (!this.isDragging) return;
        this.finishDrag();
        window.setTimeout(() => this.plugin.enforcePhysicalSorting(), 0);
    }

    finishDrag() {
        this.hidePlaceholder();
        this.draggedLeaf = null;
        this.draggedHeader = null;
        document.body.classList.remove('is-dragging-tab');
    }

    findTabBarInner(target: HTMLElement): HTMLElement | null {
        const wrapper = target.closest?.(TAB_BAR_SELECTOR);
        return wrapper ? wrapper.querySelector(TAB_BAR_INNER_SELECTOR) : null;
    }

    // 💡 탭 바 DOM에 대응하는 옵시디언 탭 묶음(WorkspaceTabs) 객체 찾기
    findTabsParent(inner: HTMLElement): InternalTabs | null {
        let found: InternalTabs | null = null;
        this.plugin.app.workspace.iterateAllLeaves(l => {
            const { parent, tabHeaderEl } = internal(l);
            if (!found && parent && tabHeaderEl?.parentElement === inner) found = parent;
        });
        return found;
    }

    // 💡 플레이스홀더 앞에 있는 탭(끌고 있는 탭 제외) 개수 = 놓을 위치
    getDropIndex(target: InternalTabs, leaf: WorkspaceLeaf): number {
        const others = target.children.filter(l => l !== leaf);
        return others.filter(l => {
            const header = internal(l).tabHeaderEl;
            return !!header && !!(header.compareDocumentPosition(this.placeholderEl) & Node.DOCUMENT_POSITION_FOLLOWING);
        }).length;
    }

    // 💡 옵시디언 기본 탭 드롭과 같은 순서로 옮깁니다 (removeChild → insertChild → selectTabIndex).
    moveLeaf(leaf: WorkspaceLeaf, target: InternalTabs, index: number) {
        const source = internal(leaf).parent;
        if (source === target && target.children.indexOf(leaf) === index) return;

        source?.removeChild(leaf);
        if (source !== target) internal(leaf).setDimension?.(null);
        target.insertChild(index, leaf);
        target.selectTabIndex?.(target.children.indexOf(leaf));
        (this.plugin.app.workspace as unknown as { requestResize?(): void }).requestResize?.();
    }

    hidePlaceholder() {
        this.placeholderEl.remove();
        this.draggedHeader?.classList.remove('tab-group-drag-source');
        document.body.classList.remove('is-dragging-tab-in-tab-bar');
    }

    updatePlaceholder(inner: HTMLElement, clientX: number) {
        // 💡 끌고 있는 원래 탭은 같은 탭 바 안에서는 숨겨서, 빈칸이 플레이스홀더 하나만 보이게 합니다.
        const source = this.draggedHeader;
        if (source) source.classList.toggle('tab-group-drag-source', source.parentElement === inner);

        const items = Array.from(inner.children).filter(el =>
            el !== this.placeholderEl &&
            el !== source &&
            (el.classList.contains('workspace-tab-header') || el.classList.contains('tab-group-label')) &&
            window.getComputedStyle(el).display !== 'none'
        ) as HTMLElement[];

        // 💡 위치는 플레이스홀더가 없을 때의 탭 배치 기준으로 계산합니다.
        // (플레이스홀더가 탭을 밀어낸 배치로 계산하면 커서가 가만히 있어도 자리가 왔다 갔다 합니다.)
        this.placeholderEl.classList.add('is-measuring');
        const sample = items.find(el => el.classList.contains('workspace-tab-header'));
        const sampleWidth = sample?.getBoundingClientRect().width;
        // 각 요소의 가운데를 기준으로, 커서보다 오른쪽에 있는 첫 요소 앞에 넣습니다.
        const before = items.find(el => {
            const rect = el.getBoundingClientRect();
            return clientX < rect.left + rect.width / 2;
        }) ?? null;
        this.placeholderEl.classList.remove('is-measuring');

        // 🎯 놓을 탭 바의 탭과 같은 너비로 자리를 만듭니다.
        this.placeholderEl.style.width = `${sampleWidth || this.draggedWidth || 120}px`;
        const next: Node | null = before ?? this.lastItemNextSibling(inner, items);

        if (this.placeholderEl.parentElement !== inner || this.placeholderEl.nextSibling !== next) {
            inner.insertBefore(this.placeholderEl, next);
        }
    }

    // 💡 맨 뒤로 놓을 때: 마지막으로 보이는 요소 뒤. 접힌 그룹의 숨은 탭과 끌고 있는 탭은 건너뛰어,
    // 접힌 그룹 라벨과 그 탭들 사이에 끼어들지 않게 합니다.
    lastItemNextSibling(inner: HTMLElement, items: HTMLElement[]): Node | null {
        const last = items[items.length - 1];
        if (!last) return null;
        let next = last.nextElementSibling;
        while (next && (
            next === this.placeholderEl ||
            next === this.draggedHeader ||
            (next.classList.contains('workspace-tab-header') && window.getComputedStyle(next).display === 'none')
        )) {
            next = next.nextElementSibling;
        }
        return next;
    }

    unload() {
        this.finishDrag();
    }
}
