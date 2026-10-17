// ✨ 그룹 라벨을 끌 때도 탭 하나를 끌 때와 같은 플레이스홀더로 들어갈 자리를 보여 줍니다.
// 크롬처럼 끄는 동안 그룹의 탭은 접어 두고 라벨만 움직이며, 플레이스홀더도 라벨 너비만큼만 만듭니다.
// 다른 그룹은 한 덩어리로 보고 그 앞·뒤에만 자리를 만듭니다.

export interface GroupDropTarget {
    node: HTMLElement;
    insertAfter: boolean;
}

// 💡 탭 바 안의 한 덩어리: 그룹(라벨 + 탭들) 또는 그룹 없는 탭 하나
interface Block {
    first: HTMLElement;
    last: HTMLElement;
    visible: HTMLElement[];
}

const isHidden = (el: Element) => window.getComputedStyle(el).display === 'none';

export class GroupDragController {
    placeholderEl: HTMLElement;
    groupId: string | null = null;
    labelEl: HTMLElement | null = null;
    tabEls: HTMLElement[] = [];
    labelWidth = 0;

    constructor() {
        this.placeholderEl = createDiv({ cls: 'tab-group-drag-placeholder' });
    }

    // 💡 끌기 시작: 라벨 너비를 재 두고, 그룹의 탭들은 끝날 때까지 접어 둡니다.
    // (끄는 요소인 라벨 자체를 dragstart 안에서 숨기면 드래그가 취소되므로 라벨은 update에서 숨김)
    start(groupId: string, labelEl: HTMLElement) {
        this.groupId = groupId;
        this.labelEl = labelEl;
        this.labelWidth = labelEl.getBoundingClientRect().width;
        const inner = labelEl.parentElement;
        this.tabEls = inner ? this.groupEls(inner, groupId).filter(el => el !== labelEl) : [];
        this.tabEls.forEach(el => el.classList.add('tab-group-drag-source'));
    }

    // 💡 커서 위치에 플레이스홀더를 놓고, 놓았을 때 그룹을 꽂을 기준 요소를 돌려줍니다.
    update(inner: HTMLElement, clientX: number): GroupDropTarget | null {
        // 끌고 있는 라벨은 같은 탭 바 안에서는 숨겨서, 빈칸이 플레이스홀더 하나만 보이게 합니다.
        this.labelEl?.classList.toggle('tab-group-drag-source', this.labelEl.parentElement === inner);

        const blocks = this.blocksOf(inner);
        // 위치는 플레이스홀더가 없을 때의 배치 기준으로, 각 덩어리의 가운데를 넘었는지로 정합니다.
        this.placeholderEl.classList.add('is-measuring');
        const before = blocks.find(block => {
            const left = block.visible[0]!.getBoundingClientRect().left;
            const right = block.visible[block.visible.length - 1]!.getBoundingClientRect().right;
            return clientX < (left + right) / 2;
        });
        this.placeholderEl.classList.remove('is-measuring');

        this.placeholderEl.style.setProperty('--tab-group-placeholder-width', `${this.labelWidth || 24}px`);
        const lastBlock = blocks[blocks.length - 1];
        const next: Node | null = before ? before.first : lastBlock ? lastBlock.last.nextSibling : null;
        if (this.placeholderEl.parentElement !== inner || this.placeholderEl.nextSibling !== next) {
            inner.insertBefore(this.placeholderEl, next);
        }

        if (before) return { node: before.first, insertAfter: false };
        if (lastBlock) return { node: lastBlock.last, insertAfter: true };
        return null;
    }

    // 💡 탭 바의 덩어리 목록 (끄는 그룹·플레이스홀더 제외, 보이는 요소가 하나도 없는 덩어리 제외)
    blocksOf(inner: HTMLElement): Block[] {
        const blocks: Block[] = [];
        let current: { id: string, block: Block } | null = null;
        Array.from(inner.children).forEach(child => {
            const el = child as HTMLElement;
            const isLabel = el.classList.contains('tab-group-label');
            if (!isLabel && !el.classList.contains('workspace-tab-header')) return;
            const id = el.getAttribute(isLabel ? 'data-group-id' : 'data-tab-group-id');
            if (id && id === this.groupId) return;

            if (id && current?.id === id && !isLabel) {
                current.block.last = el;
                if (!isHidden(el)) current.block.visible.push(el);
                return;
            }
            const block: Block = { first: el, last: el, visible: isHidden(el) ? [] : [el] };
            blocks.push(block);
            current = id ? { id, block } : null;
        });
        return blocks.filter(block => block.visible.length > 0);
    }

    groupEls(inner: HTMLElement, groupId: string): HTMLElement[] {
        return Array.from(inner.children).filter(el =>
            el.getAttribute('data-group-id') === groupId || el.getAttribute('data-tab-group-id') === groupId
        ) as HTMLElement[];
    }

    // 💡 탭 바 밖으로 나가면 플레이스홀더만 치우고 라벨은 다시 보이게 합니다. (탭은 끝날 때까지 접힌 채)
    hide() {
        this.placeholderEl.remove();
        this.labelEl?.classList.remove('tab-group-drag-source');
    }

    finish() {
        this.hide();
        this.tabEls.forEach(el => el.classList.remove('tab-group-drag-source'));
        this.groupId = null;
        this.labelEl = null;
        this.tabEls = [];
    }
}
