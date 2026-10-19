import { WorkspaceLeaf, WorkspaceSplit } from 'obsidian';
import type TabGroupsPlugin from './main';
import type { TabGroupData } from './main';
import { setGroupColor } from './group-style';
import { internal } from './internal';
import { GroupAction } from './ui/group-modals';
import { confirmDeleteGroup, openEditGroup } from './group-actions';

// ✨ 그룹 라벨: 그룹 맨 앞 탭 앞에 그리고, 클릭하면 접기·펼치기, 우클릭하면 관리 창, 끌면 그룹 통째로 옮기기.
export class GroupLabels {
    plugin: TabGroupsPlugin;
    // 💡 라벨 드래그 직후의 클릭 한 번은 무시 (Esc로 취소하고 버튼을 떼면 클릭으로 처리돼 접힘/펼침이 바뀌던 문제)
    ignoreNextLabelClick = false;

    constructor(plugin: TabGroupsPlugin) {
        this.plugin = plugin;
    }

    register() {
        // 💡 새로 누르기 시작하면 드래그 뒤 클릭 무시 표시를 지웁니다. (드롭으로 끝나 클릭이 오지 않은 경우)
        this.plugin.registerDomEvent(window, 'mousedown', () => { this.ignoreNextLabelClick = false; }, { capture: true });
    }

    render() {
        this.plugin.tabContainers().forEach(container => {
            // 🚨 가장 안정적인 과거 방식: 라벨 무조건 전체 삭제
            container.querySelectorAll('.tab-group-label').forEach(el => el.remove());

            const headers = Array.from(container.querySelectorAll<HTMLElement>('.workspace-tab-header'));
            const groupMap = new Map<string, HTMLElement[]>();

            headers.forEach(header => {
                const groupId = header.getAttribute('data-tab-group-id');
                if (groupId) {
                    if (!groupMap.has(groupId)) groupMap.set(groupId, []);
                    groupMap.get(groupId)!.push(header);
                } else {
                    header.removeClasses(['tab-group-hidden', 'tab-group-first', 'tab-group-last']);
                }
            });

            groupMap.forEach((groupHeaders, groupId) => {
                const groupData = this.plugin.groups.get(groupId);
                if (!groupData) return;

                const leader = groupHeaders[0];
                if (!leader) return;

                // 🚨 무조건 새로 찍어냄
                this.insertStandaloneLabel(leader, groupId, groupData);

                // 💡 숨김 스타일(display: none 등)은 styles.css의 .tab-group-hidden이 담당
                // 그룹 양 끝 탭 표시 (클래식 모양에서 그룹 바깥 모서리만 둥글게)
                groupHeaders.forEach((header, i) => {
                    header.classList.toggle('tab-group-hidden', groupData.isCollapsed);
                    header.classList.toggle('tab-group-first', i === 0);
                    header.classList.toggle('tab-group-last', i === groupHeaders.length - 1);
                });
            });
        });
    }

    // 💡 플러그인을 끌 때 라벨을 모두 치웁니다.
    removeAll() {
        this.plugin.tabContainers().forEach(container => container.querySelectorAll('.tab-group-label').forEach(el => el.remove()));
    }

    async toggleCollapsed(groupId: string, groupData: TabGroupData) {
        if (!groupData.isCollapsed) {
            await this.shiftFocusOut(groupId);
        }

        groupData.isCollapsed = !groupData.isCollapsed; // 1. 접힘 상태 반전 (열림 -> 닫힘 / 닫힘 -> 열림)
        await this.plugin.saveSettings();               // ✨ 2. 핵심 수정: 상태가 바뀌었으니 data.json에 즉시 덮어쓰기!
        this.plugin.enforcePhysicalSorting();           // 3. 화면 업데이트
    }

    // 💡 접으려는 그룹의 탭이 그 창에서 선택돼 있으면, 같은 창에서 가장 가까운 보이는 탭으로 옮깁니다.
    // 보이는 탭이 하나도 없으면 크롬처럼 새 탭을 엽니다. (그대로 두면 숨은 탭의 내용이 계속 보임)
    async shiftFocusOut(groupId: string) {
        const plugin = this.plugin;
        const pane = plugin.groupLeaves(groupId).map(leaf => internal(leaf).parent).find(p => p);
        if (!pane) return;
        const selected = pane.children[pane.currentTab ?? -1];
        if (!selected || plugin.leafGroupMap.get(selected) !== groupId) return;

        const index = pane.children.indexOf(selected);
        const isVisible = (leaf: WorkspaceLeaf) => plugin.leafGroupMap.get(leaf) !== groupId && !plugin.isLeafHidden(leaf);
        const target = pane.children.slice(index + 1).find(isVisible)
            ?? pane.children.slice(0, index).reverse().find(isVisible)
            ?? plugin.app.workspace.createLeafInParent(pane as unknown as WorkspaceSplit, pane.children.length);
        plugin.app.workspace.setActiveLeaf(target, { focus: true });
        await new Promise(resolve => window.setTimeout(resolve, 20));
    }

    // ✨ 관리 창의 3가지 액션 (크롬과 같은 뜻)
    // - 숨기기: 탭을 닫고 그룹은 남김 → 설정·명령어에서 다시 열기
    // - 해제: 탭은 일반 탭으로 남기고 그룹을 지움
    // - 삭제: 확인 뒤 탭을 닫고 그룹도 지움
    async applyAction(groupId: string, action: GroupAction) {
        const plugin = this.plugin;
        if (action === 'hide') await plugin.hideGroup(groupId);
        else if (action === 'ungroup') await plugin.ungroupGroup(groupId);
        else confirmDeleteGroup(plugin, groupId);
    }

    insertStandaloneLabel(leaderEl: HTMLElement, groupId: string, groupData: TabGroupData) {
        const plugin = this.plugin;
        const container = leaderEl.parentElement;
        if (!container) return;

        const labelEl = createDiv({ cls: 'tab-group-label' });
        labelEl.setAttribute('data-group-id', groupId);

        labelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.ignoreNextLabelClick) {
                this.ignoreNextLabelClick = false;
                return;
            }
            void this.toggleCollapsed(groupId, groupData);
        });

        labelEl.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault(); // 기본 브라우저 우클릭 메뉴 차단

            openEditGroup(plugin, groupId);
        });

        labelEl.draggable = true;
        labelEl.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('application/x-tab-group-id', groupId);
            e.dataTransfer!.effectAllowed = 'move';

            plugin.draggingGroupId = groupId; // 💡 드래그 시작! 무슨 그룹인지 내장 메모리에 꽉 저장!
            document.body.classList.add('is-dragging-tab-group'); // 드래그 시작 시 body에 신호 보내기
            // 크롬처럼 그룹의 탭은 접고 라벨만 끕니다. (반투명 잔상도 라벨 모습 그대로)
            plugin.groupDrag.start(groupId, labelEl);
        });
        labelEl.addEventListener('dragend', () => {
            plugin.draggingGroupId = null; // 💡 마우스 놓으면 까먹기 (초기화)
            this.ignoreNextLabelClick = true; // Esc 취소 뒤 버튼을 뗄 때 오는 클릭으로 접힘 상태가 바뀌지 않게
            plugin.groupDrag.finish(); // 혹시 남은 플레이스홀더를 치우고 숨겼던 그룹을 되돌림
            document.body.classList.remove('is-dragging-tab-group'); // 드래그 종료 시 body 신호 제거
        });

        // 💡 이름은 안쪽 span에 둡니다. (밑줄 모양에서는 바깥 라벨이 탭 바 높이를 채워 밑줄을 그리고, span이 알약 모양)
        labelEl.createSpan({ cls: 'tab-group-label-text', text: groupData.name });
        labelEl.toggleClass('is-collapsed', groupData.isCollapsed);
        setGroupColor(labelEl, groupData.color);

        // 리더 탭 앞에 삽입
        container.insertBefore(labelEl, leaderEl);
    }
}
