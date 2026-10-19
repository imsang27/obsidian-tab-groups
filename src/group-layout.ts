import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { clearGroupHeader, removeLegacyInlineColor, setGroupColor } from './group-style';
import { InternalTabs, internal } from './internal';

// ✨ 탭 바 정리: 같은 그룹의 탭을 한데 모으고(화면과 옵시디언 내부 순서 모두), 그룹 표시와 라벨을 다시 그립니다.
// 탭 바가 바뀌면 감시자(MutationObserver)가 알려 주어 화면이 그려지기 전에 정리합니다.
export class GroupLayout {
    plugin: TabGroupsPlugin;
    // ✨ 핵심: 브라우저가 화면을 그리기 전에 조작을 끝내버리는 초고속 감시자
    globalObservers: Map<Element, MutationObserver> = new Map();
    // 💡 지난 정리 때 그룹마다 속해 있던 탭 (마지막 탭이 닫혔는지 알아보는 데 씀)
    lastMembers: Map<string, WorkspaceLeaf[]> = new Map();

    constructor(plugin: TabGroupsPlugin) {
        this.plugin = plugin;
    }

    setupObservers() {
        const plugin = this.plugin;
        // 💡 닫힌 창의 탭 바 감시자는 떼어 냅니다. (남겨 두면 창을 열고 닫을 때마다 쌓임)
        this.globalObservers.forEach((observer, container) => {
            if (container.isConnected) return;
            observer.disconnect();
            this.globalObservers.delete(container);
        });
        plugin.tabContainers().forEach(container => {
            if (!this.globalObservers.has(container)) {
                const observer = new MutationObserver((mutations) => {
                    // 🚨 꺼진 인스턴스의 감시자가 남아 있으면 스스로 떼어 냅니다. (다른 인스턴스와 핑퐁 방지)
                    if (plugin.unloaded) { observer.disconnect(); return; }
                    // ✨ 탭을 손으로 잡고 드래그 중이거나 그룹 드래그 중일 때는 절대 간섭하지 않음
                    if (plugin.draggingGroupId || plugin.tabDrag.isDragging) return;

                    // ✨ 플레이스홀더 자체의 삽입/제거로 발생한 DOM 변경은 감시 대상에서 제외
                    const isOnlyPlaceholderMutation = mutations.every(m => {
                        const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
                        return nodes.length > 0 && nodes.every(n =>
                            (n as HTMLElement).classList?.contains('tab-group-drag-placeholder')
                        );
                    });
                    if (isOnlyPlaceholderMutation) return;

                    this.enforcePhysicalSorting();
                });
                this.globalObservers.set(container, observer);
                observer.observe(container, { childList: true, attributes: true, attributeFilter: ['class'] });
            }
        });
    }

    disconnectObservers() {
        this.globalObservers.forEach(obs => obs.disconnect());
    }

    // 💡 trackMoves: 지난 정렬 뒤 탭 하나가 옮겨졌으면(단축키·Pane Relief 등) 그룹 편입·이탈을 먼저 반영
    enforcePhysicalSorting(options: { trackMoves?: boolean } = {}) {
        const plugin = this.plugin;
        // ✨ 무한루프 방지: 우리가 DOM을 엎어버리는 동안에는 감시자를 잠시 끕니다.
        this.disconnectObservers();

        try {
            const tabContainers = plugin.tabContainers();

            let groupChanged = false;
            if (options.trackMoves !== false) {
                tabContainers.forEach(container => {
                    if (plugin.tabMoves.applyMove(container)) groupChanged = true;
                });
            }
            if (this.detachStrayTabs()) groupChanged = true;
            if (this.removeClosedGroups()) groupChanged = true;

            this.restoreDomAttributes();

            tabContainers.forEach(container => {
                const headers = Array.from(container.querySelectorAll<HTMLElement>('.workspace-tab-header'));
                const newOrder: { type: string, id?: string, el?: HTMLElement }[] = [];
                const groupBlocks = new Map<string, HTMLElement[]>();

                headers.forEach(header => {
                    header.style.removeProperty('order');
                    const groupId = header.getAttribute('data-tab-group-id');

                    if (groupId) {
                        if (!groupBlocks.has(groupId)) {
                            groupBlocks.set(groupId, []);
                            newOrder.push({ type: 'group', id: groupId });
                        }
                        groupBlocks.get(groupId)!.push(header);
                    } else {
                        newOrder.push({ type: 'single', el: header });
                    }
                });

                const sortedHeaders: HTMLElement[] = [];

                newOrder.forEach(item => {
                    if (item.type === 'single' && item.el) {
                        container.appendChild(item.el);
                        sortedHeaders.push(item.el);
                    } else if (item.type === 'group' && item.id) {
                        groupBlocks.get(item.id)!.forEach(el => {
                            container.appendChild(el);
                            sortedHeaders.push(el);
                        });
                    }
                });

                const sortedLeaves = sortedHeaders.map(h => plugin.findLeafFromHeader(h)).filter(l => l !== null);
                if (sortedLeaves.length > 0) {
                    const parentGroup = internal(sortedLeaves[0]!).parent;

                    if (parentGroup && Array.isArray(parentGroup.children)) {
                        if (parentGroup.children.length === sortedLeaves.length) {
                            const activeHeader = sortedHeaders.find(h => h.classList.contains('is-active'));
                            const activeLeaf = activeHeader ? plugin.findLeafFromHeader(activeHeader) : null;

                            parentGroup.children = sortedLeaves;

                            if (activeLeaf && parentGroup.currentTab !== undefined) {
                                const newActiveIndex = sortedLeaves.indexOf(activeLeaf);
                                if (newActiveIndex !== -1) parentGroup.currentTab = newActiveIndex;
                            }
                        }
                    }
                }
            });

            plugin.labels.render();

            tabContainers.forEach(container => plugin.tabMoves.remember(container));
            this.rememberMembers();
            if (groupChanged) void plugin.saveSettings(); // ✨ 그룹 소속이 바뀌었으니 data.json에 저장
        } finally {
            // ✨ 우리 작업이 완벽히 끝나면 감시자를 다시 가동합니다.
            this.globalObservers.forEach((obs, container) => {
                obs.observe(container, { childList: true, attributes: true, attributeFilter: ['class'] });
            });
        }
    }

    restoreDomAttributes() {
        const plugin = this.plugin;
        plugin.app.workspace.iterateAllLeaves(leaf => {
            const header = internal(leaf).tabHeaderEl;
            if (header) {
                const savedGroupId = plugin.leafGroupMap.get(leaf);
                if (savedGroupId) {
                    header.setAttribute('data-tab-group-id', savedGroupId);
                    const groupData = plugin.groups.get(savedGroupId);
                    if (groupData) {
                        // 💡 색은 CSS 변수로만 넘기고, 실제 스타일은 styles.css의 .tab-group-member가 담당
                        header.addClass('tab-group-member');
                        removeLegacyInlineColor(header);
                        setGroupColor(header, groupData.color);
                    }
                } else {
                    clearGroupHeader(header);
                }
            }
        });
    }

    // 💡 플러그인을 끌 때 탭 헤더를 원래 모습으로 되돌립니다. (그대로 두면 끈 뒤에도 접힌 그룹의 탭이 숨겨진 채 남음)
    clearAllHeaders() {
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
            const header = internal(leaf).tabHeaderEl;
            if (header) clearGroupHeader(header);
        });
    }

    // 💡 설정에서 켜 두면, 마지막 탭이 닫혀 탭이 하나도 남지 않은 그룹을 지웁니다. (크롬처럼)
    // 탭을 그룹에서 빼거나 다른 창으로 옮겨서 비게 된 경우는 탭이 닫힌 게 아니므로 그대로 둡니다. 지웠으면 true.
    removeClosedGroups(): boolean {
        const plugin = this.plugin;
        if (!plugin.settings.removeEmptyGroups) return false;
        const openLeaves = new Set<WorkspaceLeaf>();
        plugin.app.workspace.iterateAllLeaves(leaf => { openLeaves.add(leaf); });

        let changed = false;
        this.lastMembers.forEach((leaves, groupId) => {
            if (!plugin.groups.has(groupId) || leaves.length === 0) return;
            const allClosed = leaves.every(leaf => !openLeaves.has(leaf));
            if (allClosed && plugin.groupLeaves(groupId).length === 0) {
                plugin.groups.delete(groupId);
                changed = true;
            }
        });
        return changed;
    }

    rememberMembers() {
        this.lastMembers = new Map([...this.plugin.groups.keys()].map(groupId => [groupId, this.plugin.groupLeaves(groupId)]));
    }

    // 💡 탭 하나를 다른 창으로 옮기면(옵시디언 기본 드래그·분할 등) 그룹이 두 창에 걸칩니다.
    // 크롬처럼 옮겨 간 탭은 그룹에서 빠지고, 그룹은 원래 창(라벨이 있던 창, 없으면 탭이 더 많은 창)에 남깁니다.
    // 소속이 바뀌었으면 true.
    detachStrayTabs(): boolean {
        const plugin = this.plugin;
        const byGroup = new Map<string, Map<InternalTabs, WorkspaceLeaf[]>>();
        plugin.app.workspace.iterateAllLeaves(leaf => {
            const groupId = plugin.leafGroupMap.get(leaf);
            const pane = internal(leaf).parent;
            if (!groupId || !pane) return;
            if (!byGroup.has(groupId)) byGroup.set(groupId, new Map());
            const panes = byGroup.get(groupId)!;
            if (!panes.has(pane)) panes.set(pane, []);
            panes.get(pane)!.push(leaf);
        });

        let changed = false;
        byGroup.forEach((panes, groupId) => {
            if (panes.size < 2) return;
            const entries = [...panes.entries()];
            const hasLabel = ([pane]: [InternalTabs, WorkspaceLeaf[]]) => {
                const header = pane.children.map(l => internal(l).tabHeaderEl).find(h => h);
                return !!header?.parentElement?.querySelector(`.tab-group-label[data-group-id="${groupId}"]`);
            };
            const keep = entries.find(hasLabel) ?? entries.reduce((a, b) => (b[1].length > a[1].length ? b : a));
            entries.forEach(entry => {
                if (entry === keep) return;
                entry[1].forEach(leaf => plugin.leafGroupMap.delete(leaf));
                changed = true;
            });
        });
        return changed;
    }
}
