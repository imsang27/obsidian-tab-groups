import { WorkspaceLeaf } from 'obsidian';

// ✨ 그룹이 기억해 두는 탭 하나 (숨긴 그룹을 다시 열 때 이 상태로 탭을 엽니다)
// 노트 탭이면 state.file에 노트 경로가, 그래프 같은 화면이면 type에 화면 종류가 들어갑니다.
export interface SavedTab {
    type: string;
    state?: Record<string, unknown>;
}

export function snapshotLeaf(leaf: WorkspaceLeaf): SavedTab {
    const { type, state } = leaf.getViewState();
    return state ? { type, state: { ...state } } : { type };
}

export function savedTabFile(tab: SavedTab): string | null {
    const file = tab.state?.file;
    return typeof file === 'string' ? file : null;
}

// 💡 노트·폴더 이름이 바뀌면 기억해 둔 경로도 따라 바꿉니다. 바뀐 게 있으면 true.
export function renameSavedTabs(tabs: SavedTab[], oldPath: string, newPath: string): boolean {
    let changed = false;
    tabs.forEach(tab => {
        const file = savedTabFile(tab);
        if (!file || !tab.state) return;
        if (file === oldPath) tab.state.file = newPath;
        else if (file.startsWith(oldPath + '/')) tab.state.file = newPath + file.slice(oldPath.length);
        else return;
        changed = true;
    });
    return changed;
}

// 💡 이번 정리에서 그룹이 기억할 탭 목록을 정합니다.
// - 그룹에 열린 탭이 있으면: 그 탭들 그대로
// - 열린 탭이 하나도 없으면:
//   - 지난번에도 없었으면(시작 직후, 이미 숨긴 그룹): 기억한 목록 유지
//   - 지난번 탭들이 닫혀서 비었으면: 닫힌 탭들을 기억 (다시 열 수 있게)
//   - 탭을 빼거나 다른 창으로 옮겨서 비었으면(닫힌 탭 없음): 비움 (아직 열려 있으니 다시 열 게 없음)
export function nextSavedTabs(
    current: SavedTab[],
    previous: SavedTab[],
    closedSinceLast: SavedTab[] | null,
): SavedTab[] {
    if (current.length > 0) return current;
    if (closedSinceLast === null) return previous;
    return closedSinceLast;
}
