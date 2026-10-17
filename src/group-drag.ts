// ✨ 그룹 라벨을 끌 때도 탭 하나를 끌 때와 같은 플레이스홀더로 들어갈 자리를 보여 줍니다.
// 다른 그룹은 한 덩어리로 보고 그 앞·뒤에만 자리를 만들고, 끌고 있는 그룹은 같은 탭 바 안에서 접어 둡니다.

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
    sourceEls: HTMLElement[] = [];
    blockWidth = 0;

    constructor() {
        this.placeholderEl = createDiv({ cls: 'tab-group-drag-placeholder' });
    }

    // 💡 끌기 시작: 끄는 그룹이 차지하던 너비(라벨 + 보이는 탭)를 재 둡니다.
    start(groupId: string, labelEl: HTMLElement) {
        this.groupId = groupId;
        const inner = labelEl.parentElement;
        this.sourceEls = inner ? this.groupEls(inner, groupId) : [labelEl];
        const first = this.sourceEls[0]!.getBoundingClientRect();
        const last = this.sourceEls.filter(el => !isHidden(el)).pop()?.getBoundingClientRect() ?? first;
        this.blockWidth = last.right - first.left;
    }

    // 💡 커서 위치에 플레이스홀더를 놓고, 놓았을 때 그룹을 꽂을 기준 요소를 돌려줍니다.
    update(inner: HTMLElement, clientX: number): GroupDropTarget | null {
        // 끌고 있는 그룹은 같은 탭 바 안에서는 숨겨서, 빈칸이 플레이스홀더 하나만 보이게 합니다.
        this.sourceEls.forEach(el => el.classList.toggle('tab-group-drag-source', el.parentElement === inner));

        const blocks = this.blocksOf(inner);
        // 위치는 플레이스홀더가 없을 때의 배치 기준으로, 각 덩어리의 가운데를 넘었는지로 정합니다.
        this.placeholderEl.classList.add('is-measuring');
        const before = blocks.find(block => {
            const left = block.visible[0]!.getBoundingClientRect().left;
            const right = block.visible[block.visible.length - 1]!.getBoundingClientRect().right;
            return clientX < (left + right) / 2;
        });
        this.placeholderEl.classList.remove('is-measuring');

        this.placeholderEl.style.width = `${this.blockWidth || 120}px`;
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

    hide() {
        this.placeholderEl.remove();
        this.sourceEls.forEach(el => el.classList.remove('tab-group-drag-source'));
    }

    finish() {
        this.hide();
        this.groupId = null;
        this.sourceEls = [];
    }
}
