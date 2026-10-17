import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { splitDirectionAt } from './group-drag';
import { InternalTabs, internal } from './internal';

// ✨ 그룹(라벨)을 끌고 놓을 때의 처리: 탭 바 안 재배치, 다른 창으로 병합, 편집 화면 가장자리에 놓아 창 분할.
// 자리 표시(플레이스홀더)와 분할 미리보기를 그리는 일은 GroupDragController(group-drag.ts)가 맡습니다.
export class GroupDropHandler {
    plugin: TabGroupsPlugin;
    // ✨ 드래그 피드백용 변수
    currentDropTarget: { node: Node | null, insertAfter: boolean } = { node: null, insertAfter: false };

    constructor(plugin: TabGroupsPlugin) {
        this.plugin = plugin;
    }

    register() {
        const plugin = this.plugin;
        // ✨ 옵시디언이 이벤트를 씹어먹기 전에 우리가 먼저(capture: true) 낚아챕니다!
        plugin.registerDomEvent(window, 'dragenter', this.onDragEnter, { capture: true });
        plugin.registerDomEvent(window, 'dragover', this.onDragOver, { capture: true });
        plugin.registerDomEvent(window, 'drop', this.onDrop, { capture: true });

        // ✨ 그룹을 끌다가 창 밖으로 나가면 자리 표시 숨기기
        plugin.registerDomEvent(window, 'dragleave', (e: DragEvent) => {
            if (!e.relatedTarget) {
                plugin.groupDrag.hide();
                plugin.groupDrag.hideSplitPreview();
            }
        }, { capture: true });
    }

    // ✨ 1. 진입 단계 처리
    // 💡 window 리스너로 넘기므로 this가 고정되는 화살표 함수로 정의
    onDragEnter = (e: DragEvent) => {
        if (this.plugin.draggingGroupId) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }
    };

    // ✨ 2. 그룹을 끄는 동안: 탭 바 안이면 탭 드래그와 같은 플레이스홀더로 들어갈 자리를 보여 줌
    onDragOver = (e: DragEvent) => {
        // 💡 보안 정책에 막히는 getData 대신, 아까 저장해둔 내장 메모리 변수 사용!
        if (!this.plugin.draggingGroupId) return; // 💡 단일 탭일 때는 즉시 패스하여 TabDragController로 넘김!

        // 💡 핵심: 그룹 ID가 확인되면, DOM을 탐색하기도 전에 무조건 닥치고 옵시디언부터 차단!
        e.preventDefault();
        e.stopPropagation();
        // 🔥 여기서도 무력 제압 유지
        e.stopImmediatePropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const groupDrag = this.plugin.groupDrag;
        const container = this.findTabBarInner(e.target as HTMLElement);
        if (!container) {
            // 💡 탭 바 밖(에디터 본문 등): 자리 표시는 치우고, 편집 화면 위면 분할 미리보기를 보여 줌 (드롭은 onGroupDrop에서 처리)
            groupDrag.hide();
            this.currentDropTarget.node = null;
            const leafEl = (e.target as HTMLElement).closest?.<HTMLElement>('.workspace-leaf');
            if (leafEl) groupDrag.showSplitPreview(leafEl, splitDirectionAt(leafEl, e.clientX, e.clientY));
            else groupDrag.hideSplitPreview();
            return;
        }

        groupDrag.hideSplitPreview();
        const target = groupDrag.update(container, e.clientX);
        this.currentDropTarget = target ?? { node: null, insertAfter: false };
    };

    findTabBarInner(target: HTMLElement): HTMLElement | null {
        const wrapper = target.closest?.('.workspace-tab-header-container');
        return wrapper ? wrapper.querySelector<HTMLElement>('.workspace-tab-header-container-inner') : null;
    }

    // ✨ 빈 공간 및 탭 드롭 허용 로직
    onDrop = (e: DragEvent) => {
        // 💡 Drop에서도 getData 대신 확실한 내장 메모리를 사용합니다.
        const draggedGroupId = this.plugin.draggingGroupId;
        if (!draggedGroupId) return; // 💡 단일 탭 드롭은 TabDragController가 처리

        const groupDrag = this.plugin.groupDrag;
        // 💡 마지막 dragover가 늦게 처리돼도 놓은 좌표 그대로 자리를 한 번 더 맞춥니다.
        const container = this.findTabBarInner(e.target as HTMLElement);
        if (container) this.currentDropTarget = groupDrag.update(container, e.clientX) ?? { node: null, insertAfter: false };
        // 💡 플레이스홀더 위에 놓았으면 e.target이 곧 치워지므로, 놓은 곳은 미리 탭 바로 바꿔 둡니다.
        const dropTarget = container ?? e.target as HTMLElement;
        groupDrag.finish(); // 플레이스홀더를 치우고 숨겼던 그룹을 되돌린 뒤 옮깁니다.
        this.onGroupDrop(e, draggedGroupId, dropTarget);
    };

    // ✨ 그룹(라벨) 드롭 처리: 창 분할, 다른 창으로 병합, 같은 탭 바 안 재배치
    onGroupDrop(e: DragEvent, draggedGroupId: string, target: HTMLElement) {
        const plugin = this.plugin;
        const workspace = plugin.app.workspace;

        e.preventDefault();
        e.stopPropagation(); // 옵시디언 드롭 이벤트 차단


        // 💡 Drop에서도 바깥 래퍼를 기준으로 먼저 찾도록 수정
        const wrapper = target.closest('.workspace-tab-header-container');
        // 💡 핵심 추가: 탭 바 밖(에디터 영역)에 떨어뜨렸을 때 새 창 분할 발동!
        if (!wrapper) {
            const dropLeafEl = target.closest<HTMLElement>('.workspace-leaf');
            if (dropLeafEl) {
                // 옵시디언처럼 가장자리 25%는 그쪽으로 분할, 가운데는 그 창에 합치기 (끄는 동안 보인 미리보기와 같은 판정)
                const splitDirection = splitDirectionAt(dropLeafEl, e.clientX, e.clientY);

                // 🔥 3. 진짜 창 분할 및 탭 덩어리 이동 API 시작!
                let targetLeaf: WorkspaceLeaf | null = null;
                workspace.iterateAllLeaves(leaf => {
                    // 방금 마우스가 떨어진 에디터(.workspace-leaf)의 실제 객체를 찾습니다.
                    if (internal(leaf).containerEl === dropLeafEl) {
                        targetLeaf = leaf;
                    }
                });

                if (targetLeaf) {
                    // 드래그 중인 우리 그룹의 탭들을 싹 다 긁어모읍니다.
                    const draggedLeaves = plugin.groupLeaves(draggedGroupId);

                    if (draggedLeaves.length > 0) {
                        if (splitDirection !== 'center') {
                            const direction = (splitDirection === 'left' || splitDirection === 'right') ? 'vertical' : 'horizontal';
                            const before = (splitDirection === 'left' || splitDirection === 'top');

                            // 💡 마법의 트릭: 더미(가짜) 탭을 하나 만들어서 옵시디언이 화면을 쪼개게 만듭니다.
                            const dummyLeaf = workspace.createLeafBySplit(targetLeaf, direction, before);
                            const newParent = internal(dummyLeaf).parent!; // 새로 쪼개진 공간(부모) 확보!

                            // 💡 우리가 묶어둔 탭들을 새로 쪼개진 방으로 전부 이사시킵니다.
                            draggedLeaves.forEach(leaf => {
                                const oldParent = internal(leaf).parent;
                                if (oldParent) oldParent.removeChild(leaf); // 원래 방에서 빼고
                                // ✨ 핵심 수정: 옵시디언 내부 API에 맞춰 맨 뒤(children.length)에 탭을 밀어 넣습니다.
                                newParent.insertChild(newParent.children.length, leaf);
                            });

                            // 💡 임무를 다한 더미 탭은 조용히 암살(?)합니다.
                            dummyLeaf.detach();
                        } else {
                            // Center(가운데) 드롭 시: 해당 탭 그룹으로 모두 병합
                            const targetParent = internal(targetLeaf).parent!;
                            draggedLeaves.forEach(leaf => {
                                const oldParent = internal(leaf).parent;
                                if (oldParent !== targetParent) {
                                    if (oldParent) oldParent.removeChild(leaf);
                                    // ✨ 여기도 동일하게 insertChild 사용!
                                    targetParent.insertChild(targetParent.children.length, leaf);
                                }
                            });
                        }

                        // 이사가 끝난 후 첫 번째 탭에 포커스를 줘서 화면 렌더링을 갱신시킵니다!
                        workspace.setActiveLeaf(draggedLeaves[0]!, { focus: true });
                    }
                }
            }
            return;
        }

        // 💡 1. 현재 드롭된 탭 바(wrapper)가 속한 부모 창(targetParent) 찾기
        // (콜백 안에서 채우므로 null로 좁혀지지 않게 선언 타입을 단언으로 지정)
        let targetParent = null as InternalTabs | null;
        workspace.iterateAllLeaves(leaf => {
            // 이 탭 바 안에 존재하는 탭을 찾으면, 그 탭의 부모가 곧 타겟 창!
            if (wrapper.contains(internal(leaf).tabHeaderEl ?? null)) {
                targetParent = internal(leaf).parent;
            }
        });

        // 💡 2. 내가 드래그하고 있는 탭들의 원래 부모 창(sourceParent) 찾기
        const draggedLeaves = plugin.groupLeaves(draggedGroupId);
        const sourceParent = draggedLeaves.length > 0 ? internal(draggedLeaves[0]!).parent : null;

        if (!this.currentDropTarget.node) return; // 탭 바 내부 드롭인데 타겟이 없으면 취소

        const container = wrapper.querySelector<HTMLElement>('.workspace-tab-header-container-inner');
        if (!container) return;

        const targetNode = this.currentDropTarget.node as HTMLElement;
        const isAfter = this.currentDropTarget.insertAfter;

        // 🔥 3. 만약 다른 창의 탭 바에 던졌다면? -> 해당 창으로 통째로 병합 이사!
        let isCrossWindow = false;
        if (targetParent && sourceParent && targetParent !== sourceParent) {
            isCrossWindow = true;

            // ✨ 타겟 위치 정확히 계산 (라벨 위에 떨궜으면 그 다음 요소인 탭을 기준으로 위치 탐색)
            let actualTargetHeader = targetNode;
            if (targetNode.classList.contains('tab-group-label')) {
                actualTargetHeader = targetNode.nextElementSibling as HTMLElement || targetNode;
            }

            let targetLeafIndex = targetParent.children.length;
            const targetLeaf = plugin.findLeafFromHeader(actualTargetHeader);
            if (targetLeaf) {
                const idx = targetParent.children.indexOf(targetLeaf);
                if (idx !== -1) targetLeafIndex = isAfter ? idx + 1 : idx;
            }

            for (const [idx, leaf] of draggedLeaves.entries()) {
                const oldParent = internal(leaf).parent;
                if (oldParent) oldParent.removeChild(leaf);

                // 새 창의 맨 끝이 아닌, 우리가 계산한 위치(targetLeafIndex)에 추가
                targetParent.insertChild(targetLeafIndex + idx, leaf);
            }
        }

        // 드래그된 탭들(HTML 요소) 찾기
        // ✨ 수정: 다른 창에서 넘어올 수도 있으니 container 내부가 아닌 전체 문서(document)에서 찾습니다.
        const draggedHeaders = plugin.groupLeaves(draggedGroupId)
            .map(leaf => internal(leaf).tabHeaderEl)
            .filter((header): header is HTMLElement => !!header);
        if (draggedHeaders.length === 0) return;

        // 💡 1. 꼬임 방지를 위해 드래그된 요소들을 화면에서 잠깐 뽑아냄
        const fragment = createFragment();
        draggedHeaders.forEach(h => fragment.appendChild(h));

        // 💡 2. Hitbox 판정 결과(앞/뒤)에 따라 정확한 위치에 꽂아 넣음
        if (isAfter) {
            container.insertBefore(fragment, targetNode.nextSibling);
        } else {
            container.insertBefore(fragment, targetNode);
        }

        // 💡 3. 화면 순서가 완벽히 배치되었으니, 내부 배열(Leaf)을 정렬시킴 (그룹 통째 이동이라 탭 이동 판정은 끔)
        plugin.enforcePhysicalSorting({ trackMoves: false });

        // 타 창으로 이사했다면 첫 번째 탭에 포커스를 줘서 렌더링 강제 갱신
        if (isCrossWindow && draggedLeaves[0]) {
            workspace.setActiveLeaf(draggedLeaves[0], { focus: true });
        }
    }
}
