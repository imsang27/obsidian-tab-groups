import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';

const TAB_BAR_SELECTOR = '.workspace-tab-header-container';
const TAB_BAR_INNER_SELECTOR = '.workspace-tab-header-container-inner';

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
        this.placeholderEl = document.createElement('div');
        this.placeholderEl.className = 'tab-group-drag-placeholder';
    }

    get isDragging(): boolean {
        return this.draggedLeaf !== null;
    }

    register() {
        const opts = { capture: true };
        this.plugin.registerDomEvent(window, 'dragstart', (e) => this.onDragStart(e), opts);
        this.plugin.registerDomEvent(window, 'dragover', (e) => this.onDragOver(e), opts);
        this.plugin.registerDomEvent(window, 'dragleave', (e) => this.onDragLeave(e), opts);
        this.plugin.registerDomEvent(window, 'drop', (e) => this.onDrop(e), opts);
        this.plugin.registerDomEvent(window, 'dragend', () => this.onDragEnd(), opts);
    }

    onDragStart(e: DragEvent) {
        if (this.plugin.draggingGroupId) return;
        const header = (e.target as HTMLElement).closest?.('.workspace-tab-header') as HTMLElement | null;
        if (!header) return;
        const leaf = this.plugin.findLeafFromHeader(header);
        if (!leaf) return;

        this.draggedLeaf = leaf;
        this.draggedHeader = header;
        this.draggedWidth = header.getBoundingClientRect().width;
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

    // ✨ 새 창 분리 방지: 옵시디언은 relatedTarget 없는 dragleave를 "창 밖으로 나감"으로 보고,
    // drop을 받지 못한 채 dragend가 오면 새 창(Popout)을 엽니다. 플레이스홀더가 커서 아래에서
    // 옮겨질 때도 relatedTarget 없는 dragleave가 나므로, 커서가 창 안에 있으면 옵시디언에 전달하지 않습니다.
    // (실제로 창 밖으로 나갈 때는 좌표가 0,0으로 오므로 기존 새 창 분리 기능은 그대로 동작합니다.)
    onDragLeave(e: DragEvent) {
        if (!this.isDragging || e.relatedTarget) return;
        const inside = e.clientX > 0 && e.clientY > 0 && e.clientX < window.innerWidth && e.clientY < window.innerHeight;
        if (inside) e.stopImmediatePropagation();
    }

    onDrop(e: DragEvent) {
        const leaf = this.draggedLeaf;
        const inner = this.placeholderEl.parentElement;
        if (!leaf || !inner) return; // 탭 바 밖 드롭은 옵시디언 기본 처리(분할 등)에 맡김

        e.preventDefault();
        e.stopImmediatePropagation(); // 옵시디언이 같은 탭을 한 번 더 옮기지 않도록 차단

        const target = this.findTabsParent(inner);
        if (target) {
            const index = this.getDropIndex(target, leaf);
            this.moveLeaf(leaf, target, index);
        }
        this.finishDrag();
        this.plugin.enforcePhysicalSorting();
        this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
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
    }

    findTabBarInner(target: HTMLElement): HTMLElement | null {
        const wrapper = target.closest?.(TAB_BAR_SELECTOR);
        return wrapper ? wrapper.querySelector(TAB_BAR_INNER_SELECTOR) : null;
    }

    // 💡 탭 바 DOM에 대응하는 옵시디언 탭 묶음(WorkspaceTabs) 객체 찾기
    findTabsParent(inner: HTMLElement): any {
        let found: any = null;
        this.plugin.app.workspace.iterateAllLeaves(l => {
            const parent = (l as any).parent;
            if (!found && parent && (l as any).tabHeaderEl?.parentElement === inner) found = parent;
        });
        return found;
    }

    // 💡 플레이스홀더 앞에 있는 탭(끌고 있는 탭 제외) 개수 = 놓을 위치
    getDropIndex(target: any, leaf: WorkspaceLeaf): number {
        const others = (target.children as WorkspaceLeaf[]).filter(l => l !== leaf);
        return others.filter(l => {
            const header = (l as any).tabHeaderEl as HTMLElement | undefined;
            return !!header && !!(header.compareDocumentPosition(this.placeholderEl) & Node.DOCUMENT_POSITION_FOLLOWING);
        }).length;
    }

    // 💡 옵시디언 기본 탭 드롭과 같은 순서로 옮깁니다 (removeChild → insertChild → selectTabIndex).
    moveLeaf(leaf: WorkspaceLeaf, target: any, index: number) {
        const source = (leaf as any).parent;
        if (source === target && target.children.indexOf(leaf) === index) return;

        source?.removeChild(leaf);
        if (source !== target) (leaf as any).setDimension?.(null);
        target.insertChild(index, leaf);
        target.selectTabIndex?.(target.children.indexOf(leaf));
        (this.plugin.app.workspace as any).requestResize?.();
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
        this.placeholderEl.style.display = 'none';
        const sample = items.find(el => el.classList.contains('workspace-tab-header'));
        const sampleWidth = sample?.getBoundingClientRect().width;
        // 각 요소의 가운데를 기준으로, 커서보다 오른쪽에 있는 첫 요소 앞에 넣습니다.
        const before = items.find(el => {
            const rect = el.getBoundingClientRect();
            return clientX < rect.left + rect.width / 2;
        }) ?? null;
        this.placeholderEl.style.display = '';

        // 🎯 놓을 탭 바의 탭과 같은 너비로 자리를 만듭니다.
        this.placeholderEl.style.width = `${sampleWidth || this.draggedWidth || 120}px`;
        const next: Node | null = before ?? this.lastItemNextSibling(inner, items);

        if (this.placeholderEl.parentElement !== inner || this.placeholderEl.nextSibling !== next) {
            inner.insertBefore(this.placeholderEl, next);
        }
    }

    // 💡 맨 뒤로 놓을 때: 마지막 탭 바로 뒤 (숨김 탭·인디케이터 같은 꼬리 요소보다 앞)
    lastItemNextSibling(inner: HTMLElement, items: HTMLElement[]): Node | null {
        const last = items[items.length - 1];
        if (!last) return null;
        let next = last.nextSibling;
        if (next === this.placeholderEl) next = next.nextSibling;
        return next;
    }

    unload() {
        this.finishDrag();
    }
}
