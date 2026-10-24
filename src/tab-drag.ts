import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { GroupSlot, resolveGroupAt } from './tab-group-rules';
import { isStackedContainer } from './stacked-order';
import { setGroupColor } from './group-style';

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
    // 💡 자리 표시와 한 덩어리로 이어 보이게 모서리를 평평하게 한 양옆 그룹 탭
    joinedHeaders: HTMLElement[] = [];
    draggedLeaf: WorkspaceLeaf | null = null;
    draggedHeader: HTMLElement | null = null;
    draggedWidth = 0;
    // 💡 끌기 시작 때의 그룹 (쌓인 탭에 놓을 때는 놓기와 끌기 끝 두 번 맞추므로, 저장할지는 이것과 비교)
    startGroup: string | null = null;
    // 💡 그룹 맨 끝 자리에서 커서가 그 그룹 마지막 탭 위에 있는지 (크롬처럼 그룹 안쪽에 놓으면 편입)
    insideGroupEnd = false;

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
        // 💡 쌓인 탭 막대 안의 그룹 라벨을 끄는 건 그룹 끌기 (stacked-tabs.ts)
        if ((e.target as HTMLElement).closest?.('.tab-group-stacked-label')) return;
        const header = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-tab-header');
        if (!header) return;
        const leaf = this.plugin.findLeafFromHeader(header);
        if (!leaf) return;

        this.draggedLeaf = leaf;
        this.draggedHeader = header;
        this.startGroup = this.plugin.leafGroupMap.get(leaf) ?? null;
        // 💡 옵시디언이 놓을 때 탭을 다른 탭 묶음으로 옮기며 원래 탭 머리를 잠시 떼어 내면(쌓인 탭 창으로 끌어 올 때 등),
        // 끌기 끝(dragend)이 떨어진 요소에만 와서 창까지 오지 않습니다. 그 요소에서도 듣습니다. (먼저 온 쪽만 처리)
        header.addEventListener('dragend', this.onSourceDragEnd);
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
            // 💡 쌓인 탭 막대 사이: 들어갈 자리에 빈 막대 (stacked-tab-drag.ts)
            this.plugin.stackedTabDrag.update(e, this.draggedLeaf!);
            return;
        }
        this.plugin.stackedTabDrag.finish();

        // 💡 탭 바 안: 옵시디언 기본 드롭 선(보라색 선)은 CSS로 숨기고 플레이스홀더만 보여 줍니다.
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        document.body.classList.add('is-dragging-tab-in-tab-bar');
        this.updatePlaceholder(inner, e.clientX);
    }

    onDrop(e: DragEvent) {
        const leaf = this.draggedLeaf;
        const inner = this.findTabBarInner(e.target as HTMLElement);
        // 💡 옵시디언은 끌기 끝에 막대 위치로 자리를 다시 재므로, 쌓인 탭의 빈 막대는 놓을 때 바로 뺌
        if (!inner) {
            // 💡 다른 창에서 끌어 오면 옵시디언이 놓을 때 바로 옮기고, 그 뒤 화면 정리(layout-change)가 곧장 정렬하므로
            // 그룹은 지금 미리 맞춤 (안 그러면 그룹 탭 사이에 놓은 탭이 그룹 밖으로 보고 그룹 뒤로 밀려남)
            // 같은 탭 묶음 안에서는 옵시디언이 끌기 끝에 옮기므로 그때 맞춤 (미리 맞추면 옮기기 전에 그룹 쪽으로 정렬돼 버림)
            const dropped = this.plugin.stackedTabDrag.drop();
            if (leaf && dropped && dropped.from === -1) this.applyGroup(leaf, dropped.groupId);
        }
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
            // 💡 옵시디언은 탭 헤더를 조금 뒤에(비동기로) 옮기는데, 바로 아래 정렬은 지금 DOM 순서로 내부 순서를
            // 다시 맞추므로 옮긴 자리가 되돌려집니다. 헤더를 플레이스홀더 자리에 먼저 꽂아 둡니다.
            const header = internal(leaf).tabHeaderEl;
            if (header && this.placeholderEl.parentElement === inner) inner.insertBefore(header, this.placeholderEl);
        }
        this.finishDrag();
        this.plugin.enforcePhysicalSorting({ trackMoves: false });
        this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
        if (groupChanged) void this.plugin.saveSettings();
    }

    // ✨ 놓은 자리에 따라 그룹 소속을 정합니다. 그룹이 바뀌었으면 true를 돌려줍니다.
    applyDropGroup(leaf: WorkspaceLeaf): boolean {
        return this.applyGroup(leaf, this.dropGroup(leaf));
    }

    applyGroup(leaf: WorkspaceLeaf, newGroup: string | null): boolean {
        const current = this.plugin.leafGroupMap.get(leaf) ?? null;
        if (newGroup === current) return false;
        if (newGroup) this.plugin.leafGroupMap.set(leaf, newGroup);
        else this.plugin.leafGroupMap.delete(leaf);
        return true;
    }

    // 💡 지금 자리에 놓으면 들어갈 그룹 (플레이스홀더 양옆의 보이는 탭·라벨 기준, 규칙은 resolveGroupAt)
    dropGroup(leaf: WorkspaceLeaf): string | null {
        const slot = (el: Element | null): GroupSlot | null => el && {
            groupId: el.getAttribute('data-tab-group-id') ?? el.getAttribute('data-group-id'),
            isLabel: el.classList.contains('tab-group-label'),
        };
        const current = this.plugin.leafGroupMap.get(leaf) ?? null;
        const prev = slot(this.neighbor('previousElementSibling'));
        const next = slot(this.neighbor('nextElementSibling'));
        const isExpanded = (groupId: string) => this.plugin.isGroupExpanded(groupId);

        // 🎯 펼쳐진 그룹의 맨 끝 자리(앞은 그 그룹 탭, 뒤는 다른 것): 크롬처럼 커서가 그룹 마지막 탭 위면
        // 그룹 맨 끝으로 편입(또는 유지), 그 오른쪽이면 그룹 밖으로 놓습니다.
        const prevGroup = prev && !prev.isLabel ? prev.groupId : null;
        const atGroupEnd = !!prevGroup && isExpanded(prevGroup) && (next?.isLabel || next?.groupId !== prevGroup);
        return atGroupEnd
            ? (this.insideGroupEnd ? prevGroup : null)
            : resolveGroupAt(prev, next, current, isExpanded);
    }

    // 🎯 플레이스홀더에 놓으면 들어갈 그룹의 색 줄을 붙여, 그룹 안에 들어가는지 밖에 놓이는지 보여 줍니다.
    // (그룹 맨 끝에서는 커서가 마지막 탭 위인지 그 오른쪽인지에 따라 바뀜)
    showDropGroup() {
        const groupId = this.draggedLeaf ? this.dropGroup(this.draggedLeaf) : null;
        const color = groupId ? this.plugin.groups.get(groupId)?.color : undefined;
        this.placeholderEl.toggleClass('is-in-group', !!color);
        if (color) setGroupColor(this.placeholderEl, color);

        // 💡 그룹 안 자리면 양옆 그룹 탭과 한 덩어리로: 그룹 끝의 둥근 모서리는 자리 표시가 맡고,
        // 자리 표시와 맞닿은 그룹 탭의 모서리는 평평하게 (클래식 모양에서 씀)
        this.clearJoined();
        const sameGroup = (el: Element | null): el is HTMLElement => !!color && !!el
            && el.classList.contains('workspace-tab-header') && el.getAttribute('data-tab-group-id') === groupId;
        const prev = this.neighbor('previousElementSibling'), next = this.neighbor('nextElementSibling');
        this.placeholderEl.toggleClass('is-group-first', !!color && !sameGroup(prev));
        this.placeholderEl.toggleClass('is-group-last', !!color && !sameGroup(next));
        if (sameGroup(prev)) this.join(prev, 'tab-group-joined-right');
        if (sameGroup(next)) this.join(next, 'tab-group-joined-left');
    }

    join(header: HTMLElement, cls: string) {
        header.addClass(cls);
        this.joinedHeaders.push(header);
    }

    clearJoined() {
        this.joinedHeaders.forEach(header => header.removeClasses(['tab-group-joined-right', 'tab-group-joined-left']));
        this.joinedHeaders = [];
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
        // 💡 쌓인 탭 모드의 막대는 옵시디언이 직접 옮기므로, 놓은 자리로 그룹 편입·이탈을 정함 (탭 바에서는 onDrop이 이미 정함)
        const stacked = !!this.draggedHeader?.parentElement && isStackedContainer(this.draggedHeader.parentElement);
        const leaf = this.draggedLeaf;
        const startGroup = this.startGroup;
        const dropped = this.plugin.stackedTabDrag.takeDropped();
        this.finishDrag();
        window.setTimeout(() => {
            // 💡 쌓인 탭 막대 사이에 놓았으면 빈 막대가 보여 준 그룹으로 맞춤 (그룹 맨 끝은 커서 위치로 정해서)
            // 정렬보다 먼저 맞춤: 그룹 밖으로 본 채 정렬하면 그룹 탭 사이에 놓은 탭이 그룹 뒤로 밀려남
            if (leaf && dropped) {
                this.applyGroup(leaf, dropped.groupId);
                this.plugin.enforcePhysicalSorting({ trackMoves: false });
                if (dropped.groupId !== startGroup) void this.plugin.saveSettings();
                return;
            }
            this.plugin.enforcePhysicalSorting(stacked ? { dropped: true } : { trackMoves: false });
        }, 0);
    }

    onSourceDragEnd = () => this.onDragEnd();

    finishDrag() {
        this.draggedHeader?.removeEventListener('dragend', this.onSourceDragEnd);
        this.hidePlaceholder();
        this.plugin.stackedTabDrag.finish();
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
        this.clearJoined();
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
            window.getComputedStyle(el).display !== 'none',
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

        // 💡 플레이스홀더 바로 앞 요소의 오른쪽 끝보다 왼쪽이면 "그 요소 안쪽"에 놓는 것으로 봅니다. (그룹 맨 끝 판단용)
        const prevItem = before ? items[items.indexOf(before) - 1] : items[items.length - 1];
        this.insideGroupEnd = !!prevItem && clientX < prevItem.getBoundingClientRect().right;
        this.placeholderEl.classList.remove('is-measuring');

        // 🎯 놓을 탭 바의 탭과 같은 너비로 자리를 만듭니다.
        this.placeholderEl.style.setProperty('--tab-group-placeholder-width', `${sampleWidth || this.draggedWidth || 120}px`);
        const next: Node | null = before ?? this.lastItemNextSibling(inner, items);

        if (this.placeholderEl.parentElement !== inner || this.placeholderEl.nextSibling !== next) {
            inner.insertBefore(this.placeholderEl, next);
        }
        this.showDropGroup();
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
