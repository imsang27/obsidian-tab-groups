import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TabGroupsSettings, DEFAULT_SETTINGS } from './settings';
import { TabDragController } from './tab-drag';
import { GroupDragController } from './group-drag';
import { GroupDropHandler } from './group-drop';
import { GroupLabels } from './group-labels';
import { GroupLayout } from './group-layout';
import { TabMoveTracker } from './tab-move';
import { registerHiddenTabSkip } from './hidden-tab-skip';
import { registerHiddenTabActivation } from './hidden-tab-activate';
import { registerExplorerOpen } from './explorer-open';
import { registerTabMenu } from './tab-menu';
import { setLanguage } from './i18n';
import { internal } from './internal';
import { TabGroupsSettingTab } from './settings-tab';
import { PRESET_COLORS } from './ui/color-palette';

export interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>;
    isCollapsed: boolean;
}

// ✨ 플러그인 본체: 그룹 데이터(그룹 목록, 탭 → 그룹 매핑)와 저장, 수명 주기를 맡고,
// 기능은 각 모듈(탭 메뉴, 라벨, 정렬, 드래그·드롭, 탭 이동 추적 등)에 나눠 둡니다.
export default class TabGroupsPlugin extends Plugin {
    settings: TabGroupsSettings = { ...DEFAULT_SETTINGS }; // ✨ 셋팅 변수 추가
    groups: Map<string, TabGroupData> = new Map();
    leafGroupMap: WeakMap<WorkspaceLeaf, string> = new WeakMap();

    // 💡 지금 끌고 있는 그룹 (드래그 이벤트의 getData는 보안 정책에 막혀서 직접 기억)
    draggingGroupId: string | null = null;

    // ✨ 탭 하나 드래그(플레이스홀더·드롭) 담당
    tabDrag: TabDragController = new TabDragController(this);
    // ✨ 그룹(라벨) 드래그의 플레이스홀더 담당
    groupDrag: GroupDragController = new GroupDragController();
    // ✨ 그룹(라벨) 드롭 처리(재배치·다른 창으로 병합·창 분할) 담당
    groupDrop: GroupDropHandler = new GroupDropHandler(this);
    // ✨ 그룹 라벨(접기·관리 창·끌기) 담당
    labels: GroupLabels = new GroupLabels(this);
    // ✨ 탭 바 정렬과 감시자 담당
    layout: GroupLayout = new GroupLayout(this);

    // ✨ 단축키·다른 플러그인으로 탭을 옮겼을 때의 그룹 편입·이탈 담당
    tabMoves: TabMoveTracker = new TabMoveTracker(this);

    // 💡 onunload가 불렸는지 (비동기 onload가 끝나기 전에 꺼질 수 있음)
    unloaded = false;

    async onload() {
        // ✨ 1. 플러그인이 켜질 때 가장 먼저 데이터를 불러옵니다.
        await this.loadSettings();
        // 🚨 불러오는 사이 꺼졌으면(hot-reload와 plugin:reload가 겹칠 때 등) 여기서 멈춥니다.
        // 꺼진 뒤에 감시자·이벤트를 달면 아무도 떼지 않아, 새로 켜진 인스턴스의 감시자와
        // 서로의 DOM 정렬에 끝없이 반응하며 옵시디언이 멈춥니다.
        if (this.unloaded) return;

        // 👇 옵시디언 화면이 다 켜진 직후에 실행되는 곳
        this.app.workspace.onLayoutReady(() => {
            if (this.unloaded) return;
            this.restoreTabsFromSettings(); // ✨ 탭 매핑 먼저 완벽하게 복구하고!
            this.layout.setupObservers();   // 감시자 달고
            this.enforcePhysicalSorting();  // 화면 정렬!
        });

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.layout.setupObservers();
                this.enforcePhysicalSorting();
            })
        );

        this.groupDrop.register();
        this.tabDrag.register();
        this.labels.register();

        // ✨ Ctrl+Tab 등으로 탭을 순환할 때 접힌 그룹의 탭은 번쩍임 없이 건너뜀
        registerHiddenTabSkip(this);
        // ✨ 숨은 탭이 활성화되면 건너뛰거나(옆 탭 이동) 그룹을 펼침(직접 열기)
        registerHiddenTabActivation(this);

        // ✨ 탐색기에서 연 노트가 접힌 그룹에 이미 열려 있으면 그 탭으로 이동
        registerExplorerOpen(this);

        // ✨ 탭 우클릭 메뉴의 그룹 항목
        registerTabMenu(this);

        this.addSettingTab(new TabGroupsSettingTab(this.app, this));
    }

    // ✨ 2. 데이터 불러오기 함수
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TabGroupsSettings>);
        setLanguage(this.settings.language);

        // 불러온 데이터를 바탕으로 this.groups 메모리에 세팅
        this.settings.savedGroups.forEach(g => {
            this.groups.set(g.id, {
                name: g.name,
                color: g.color,
                isCollapsed: g.isCollapsed,
                leafIds: new Set() // 💡 탭 매핑(복구)은 다음 단계에서 구현!
            });
        });
    }

    // ✨ 4. 저장된 데이터와 현재 열려있는 탭을 대조해서 복구하는 함수
    restoreTabsFromSettings() {
        this.settings.savedGroups.forEach(savedGroup => {
            const tabs = savedGroup.savedTabs || [];

            this.app.workspace.iterateAllLeaves(leaf => {
                // 💡 켜진 탭의 ID가 저장소에 기록되어 있다면 그 그룹으로 쏙!
                if (tabs.includes(internal(leaf).id)) {
                    this.leafGroupMap.set(leaf, savedGroup.id);
                }
            });
        });
    }

    // ✨ 3. 데이터 저장하기 함수 (고도화됨)
    async saveSettings() {
        this.settings.savedGroups = [];

        this.groups.forEach((groupData, groupId) => {
            // 💡 현재 이 그룹에 속한 탭(Leaf)들의 고유 ID를 수집합니다.
            const tabsInGroup = this.groupLeaves(groupId).map(leaf => internal(leaf).id);

            this.settings.savedGroups.push({
                id: groupId,
                name: groupData.name,
                color: groupData.color,
                isCollapsed: groupData.isCollapsed,
                savedTabs: tabsInGroup // ✨ 수집한 탭 ID들을 저장소에 배열로 기록!
            });
        });
        await this.saveData(this.settings);
    }

    // 💡 탭 바를 다시 정리합니다. (여러 모듈이 그룹을 바꾼 뒤 부름. 실제 작업은 group-layout.ts)
    enforcePhysicalSorting(options: { trackMoves?: boolean } = {}) {
        this.layout.enforcePhysicalSorting(options);
    }

    // 💡 모든 탭 바(메인 창 + 팝업 창). document만 뒤지면 팝업 창의 탭 바를 놓치므로 탭에서 거꾸로 찾습니다.
    tabContainers(): HTMLElement[] {
        const containers = new Set<HTMLElement>();
        this.app.workspace.iterateAllLeaves(leaf => {
            const container = internal(leaf).tabHeaderEl?.parentElement;
            if (container?.classList.contains('workspace-tab-header-container-inner')) containers.add(container);
        });
        return [...containers];
    }

    // 💡 그룹에 속한 탭들
    groupLeaves(groupId: string): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [];
        this.app.workspace.iterateAllLeaves(leaf => {
            if (this.leafGroupMap.get(leaf) === groupId) leaves.push(leaf);
        });
        return leaves;
    }

    findLeafFromHeader(headerEl: Element): WorkspaceLeaf | null {
        let targetLeaf: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (internal(leaf).tabHeaderEl === headerEl) {
                targetLeaf = leaf;
            }
        });
        return targetLeaf;
    }

    // 💡 새 그룹의 기본 색: 아직 다른 그룹이 쓰지 않은 팔레트 색 (모두 쓰였으면 첫 색)
    nextGroupColor(): string {
        const used = new Set([...this.groups.values()].map(g => g.color.toLowerCase()));
        return PRESET_COLORS.find(c => !used.has(c.toLowerCase())) ?? PRESET_COLORS[0]!;
    }

    // 💡 그룹 삭제: 탭은 일반 탭으로 남기고 그룹 정보를 지웁니다. (관리 창·설정 화면에서 사용)
    async deleteGroup(groupId: string) {
        this.groupLeaves(groupId).forEach(leaf => this.leafGroupMap.delete(leaf));
        this.groups.delete(groupId);
        await this.saveSettings();
        this.enforcePhysicalSorting();
    }

    isGroupExpanded(groupId: string): boolean {
        return this.groups.get(groupId)?.isCollapsed === false;
    }

    // 💡 접힌 그룹에 속해 탭 바에서 숨겨진 탭인지
    isLeafHidden(leaf: WorkspaceLeaf): boolean {
        const groupId = this.leafGroupMap.get(leaf);
        return !!groupId && this.groups.get(groupId)?.isCollapsed === true;
    }

    onunload() {
        this.unloaded = true;

        this.tabDrag.unload();
        this.groupDrag.finish();
        this.layout.disconnectObservers();
        this.labels.removeAll();
        // 🚨탭 헤더를 원래 모습으로 되돌립니다. (그대로 두면 끈 뒤에도 접힌 그룹의 탭이 숨겨진 채 남음)
        this.layout.clearAllHeaders();
        document.body.removeClasses(['is-dragging-tab', 'is-dragging-tab-in-tab-bar', 'is-dragging-tab-group']);
    }
}
