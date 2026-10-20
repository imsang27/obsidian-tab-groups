import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { internal } from './internal';

// ✨ 접힌 그룹의 숨은 탭이 활성화됐을 때 (스마트 펼침 유지)
// - 옆 탭으로 한 칸 이동하다 들어왔으면: 그 탭은 숨긴 채 같은 방향의 다음 보이는 탭으로 넘어갑니다.
//   (순환 명령은 hidden-tab-skip.ts가 번쩍임 없이 먼저 처리하고, 이것은 그 밖의 경우를 위한 대비책)
// - 지금 탭을 닫아 옵시디언이 옆의 숨은 탭을 골랐으면: 그룹은 접어 둔 채 가장 가까운 보이는 탭으로 넘어갑니다.
// - 링크·빠른 전환기 등으로 직접 열었으면: 그룹을 펼치고 그 상태를 저장합니다.
export function registerHiddenTabActivation(plugin: TabGroupsPlugin) {
    let previousActiveLeaf: WorkspaceLeaf | null = null;
    // 💡 직전 탭이 있던 자리 (그 탭을 닫으면 탭 묶음에서 빠져 위치를 알 수 없어서)
    let previousIndex = -1;
    const remember = (leaf: WorkspaceLeaf, index: number) => {
        previousActiveLeaf = leaf;
        previousIndex = index;
    };

    plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
            if (!leaf) return;

            const headerEl = internal(leaf).tabHeaderEl;
            if (!headerEl) return;

            const children = internal(leaf).parent?.children ?? [];
            const currentIndex = children.indexOf(leaf);
            const prevIndex = previousActiveLeaf ? children.indexOf(previousActiveLeaf) : -1;

            let isSequential = false;
            let direction = 1;
            if (prevIndex !== -1) {
                if (currentIndex === prevIndex + 1 || (prevIndex === children.length - 1 && currentIndex === 0)) {
                    isSequential = true; direction = 1;
                } else if (currentIndex === prevIndex - 1 || (prevIndex === 0 && currentIndex === children.length - 1)) {
                    isSequential = true; direction = -1;
                }
            }

            const groupId = plugin.leafGroupMap.get(leaf);
            if (groupId) {
                const groupData = plugin.groups.get(groupId);

                // 💡 직전 탭이 닫혀서 옵시디언이 이 탭을 고른 것이면, 옵시디언이 옮겨 간 쪽부터 보이는 탭을 찾음
                // (남은 탭이 모두 접힌 그룹 안이면 없음: 그때는 아래처럼 그룹을 펼침)
                const closed = previousActiveLeaf !== null && previousActiveLeaf !== leaf && !isOpen(plugin, previousActiveLeaf);
                const closedTarget = groupData?.isCollapsed && !isSequential && closed
                    ? nearestVisible(plugin, leaf, previousIndex !== -1 && currentIndex >= previousIndex ? 1 : -1)
                    : null;

                if (groupData && groupData.isCollapsed) {
                    if (isSequential) {
                        headerEl.classList.add('tab-group-hidden');
                        skipHiddenTab(plugin, leaf, direction);
                    } else if (closedTarget) {
                        headerEl.classList.add('tab-group-hidden');
                        remember(closedTarget, children.indexOf(closedTarget));
                        window.setTimeout(() => plugin.app.workspace.setActiveLeaf(closedTarget, { focus: true }), 0);
                    } else {
                        // 💡 링크·빠른 전환기 등으로 숨은 탭을 직접 열면 그룹을 펼치고 그 상태를 저장
                        groupData.isCollapsed = false;
                        remember(leaf, currentIndex);
                        plugin.enforcePhysicalSorting();
                        void plugin.saveSettings();
                    }
                } else {
                    remember(leaf, currentIndex);
                }
            } else {
                remember(leaf, currentIndex);
            }
        }),
    );
}

// 💡 탭이 아직 열려 있는지 (닫힌 탭은 어느 탭 묶음에도 없음)
function isOpen(plugin: TabGroupsPlugin, target: WorkspaceLeaf): boolean {
    let found = false;
    plugin.app.workspace.iterateAllLeaves(leaf => { if (leaf === target) found = true; });
    return found;
}

// 💡 같은 탭 묶음에서 direction 쪽으로 가장 가까운 보이는 탭. 그쪽 끝까지 없으면 반대쪽에서 찾음 (돌아서 넘어가지 않음)
function nearestVisible(plugin: TabGroupsPlugin, from: WorkspaceLeaf, direction: number): WorkspaceLeaf | null {
    const children = internal(from).parent?.children ?? [];
    const start = children.indexOf(from);
    if (start === -1) return null;
    for (const step of [direction, -direction]) {
        for (let i = start + step; i >= 0 && i < children.length; i += step) {
            if (!plugin.isLeafHidden(children[i]!)) return children[i]!;
        }
    }
    return null;
}

function skipHiddenTab(plugin: TabGroupsPlugin, currentLeaf: WorkspaceLeaf, direction: number) {
    const parent = internal(currentLeaf).parent;
    if (!parent || !Array.isArray(parent.children)) return;

    const children = parent.children;
    const currentIndex = children.indexOf(currentLeaf);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;
    let targetLeaf: WorkspaceLeaf | null = null;
    let count = 0;

    while (count < children.length) {
        if (nextIndex >= children.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = children.length - 1;

        const candidate = children[nextIndex]!;

        if (!plugin.isLeafHidden(candidate)) {
            targetLeaf = candidate;
            break;
        }

        nextIndex += direction;
        count++;
    }

    if (targetLeaf && targetLeaf !== currentLeaf) {
        window.setTimeout(() => {
            plugin.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        }, 0);
    }
}
