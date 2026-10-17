import { WorkspaceLeaf } from 'obsidian';

// 💡 옵시디언 비공개 API 중 그룹 관리 모듈들(main·group-layout·group-labels·group-drop)이 쓰는 부분만 타입으로 정의
export interface InternalTabs {
    children: WorkspaceLeaf[];
    currentTab?: number;
    removeChild(leaf: WorkspaceLeaf): void;
    insertChild(index: number, leaf: WorkspaceLeaf): void;
}
export interface InternalLeaf {
    id: string;
    parent: InternalTabs | null;
    tabHeaderEl?: HTMLElement;
    containerEl: HTMLElement;
}
export const internal = (leaf: WorkspaceLeaf) => leaf as unknown as InternalLeaf;
