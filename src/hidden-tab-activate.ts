import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { internal } from './internal';

// ✨ 접힌 그룹의 숨은 탭이 활성화됐을 때 (스마트 펼침 유지)
// - 옆 탭으로 한 칸 이동하다 들어왔으면: 그 탭은 숨긴 채 같은 방향의 다음 보이는 탭으로 넘어갑니다.
//   (순환 명령은 hidden-tab-skip.ts가 번쩍임 없이 먼저 처리하고, 이것은 그 밖의 경우를 위한 대비책)
// - 링크·빠른 전환기 등으로 직접 열었으면: 그룹을 펼치고 그 상태를 저장합니다.
export function registerHiddenTabActivation(plugin: TabGroupsPlugin) {
    let previousActiveLeaf: WorkspaceLeaf | null = null;

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

                if (groupData && groupData.isCollapsed) {
                    if (isSequential) {
                        headerEl.classList.add('tab-group-hidden');
                        skipHiddenTab(plugin, leaf, direction);
                    } else {
                        // 💡 링크·빠른 전환기 등으로 숨은 탭을 직접 열면 그룹을 펼치고 그 상태를 저장
                        groupData.isCollapsed = false;
                        previousActiveLeaf = leaf;
                        plugin.enforcePhysicalSorting();
                        void plugin.saveSettings();
                    }
                } else {
                    previousActiveLeaf = leaf;
                }
            } else {
                previousActiveLeaf = leaf;
            }
        })
    );
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
