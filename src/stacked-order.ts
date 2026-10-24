import { WorkspaceLeaf } from 'obsidian';
import { internal } from './internal';

// 💡 쌓인 탭(Stacked tabs) 모드의 탭 순서 도우미 (탭 이동·끌기·stacked-tabs.ts가 함께 씀)
// 쌓인 탭 묶음에서는 탭 머리가 화면 사이(.workspace-tab-container)에 세로 막대로 놓입니다.
const STACKED_CONTAINER = 'workspace-tab-container';

// 💡 옵시디언 비공개 API: 탭 묶음의 화면 다시 그리기와 쌓인 막대 위치 계산
export interface StackedTabsParent {
    children: WorkspaceLeaf[];
    currentTab?: number;
    updateTabDisplay?(): void;
    updateSlidingTabs?(): void;
}

export function isStackedContainer(container: Element): boolean {
    return container.classList.contains(STACKED_CONTAINER);
}

// 💡 쌓인 탭 묶음의 탭 순서를 바꿉니다. (머리와 화면이 번갈아 놓여 있어, DOM 대신 옵시디언에 순서를 넘겨 다시 그리게 함)
export function setStackedOrder(order: WorkspaceLeaf[]) {
    const first = order[0];
    const parent = first ? internal(first).parent as unknown as StackedTabsParent | null : null;
    if (!parent) return;
    const active = parent.children[parent.currentTab ?? -1];
    parent.children = order;
    if (active && order.includes(active)) parent.currentTab = order.indexOf(active);
    parent.updateTabDisplay?.();
}

