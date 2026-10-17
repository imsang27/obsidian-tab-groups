import { Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { t } from './i18n';
import { CreateGroupModal } from './ui/group-modals';

// ✨ 탭 우클릭 메뉴에 그룹 항목(그룹에서 제외, 다른 그룹에 넣기, 새 탭 그룹 만들기)을 더합니다.
// 옵시디언은 탭 헤더의 file-menu 이벤트에 어떤 탭인지 알려 주지 않으므로, 우클릭한 탭을 먼저 기억해 둡니다.
export function registerTabMenu(plugin: TabGroupsPlugin) {
    let lastClickedLeaf: WorkspaceLeaf | null = null;

    plugin.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const header = target.closest<HTMLElement>('.workspace-tab-header');
        if (header) {
            lastClickedLeaf = plugin.findLeafFromHeader(header);
        } else {
            lastClickedLeaf = null;
        }
    }, { capture: true });

    plugin.registerEvent(
        plugin.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {
            if (source === 'tab-header' && lastClickedLeaf) {
                const targetLeaf = lastClickedLeaf;
                const currentGroupId = plugin.leafGroupMap.get(targetLeaf);

                menu.addSeparator();

                if (currentGroupId) {
                    menu.addItem((item) => {
                        item.setTitle(t('menu.removeFromGroup'))
                            .setIcon('folder-minus')
                            .onClick(async () => { // 💡 async 추가
                                plugin.leafGroupMap.delete(targetLeaf);
                                await plugin.saveSettings(); // ✨ 상태 변경 즉시 저장!
                                plugin.enforcePhysicalSorting();
                            });
                    });
                    menu.addSeparator();
                }

                if (plugin.groups.size > 0) {
                    plugin.groups.forEach((groupData, groupId) => {
                        if (groupId !== currentGroupId) {
                            menu.addItem((item) => {
                                item.setTitle(groupData.name ? t('menu.addToGroup', { name: groupData.name }) : t('menu.addToUnnamedGroup'))
                                    .setIcon('folder-input')
                                    .onClick(async () => { // 💡 async 추가
                                        plugin.leafGroupMap.set(targetLeaf, groupId);
                                        groupData.isCollapsed = false;
                                        await plugin.saveSettings(); // ✨ 상태 변경 즉시 저장!
                                        plugin.enforcePhysicalSorting();
                                    });
                            });
                        }
                    });
                    menu.addSeparator();
                }

                menu.addItem((item) => {
                    item.setTitle(t('menu.createGroup'))
                        .setIcon('folder-plus')
                        .onClick(() => {
                            new CreateGroupModal(plugin.app, plugin.nextGroupColor(), async (groupName, color) => {
                                const groupId = 'group-' + Date.now();
                                plugin.groups.set(groupId, { name: groupName, color: color, leafIds: new Set(), isCollapsed: false });

                                plugin.leafGroupMap.set(targetLeaf, groupId);

                                // ✨ 그룹이 생성되었으니 data.json에 즉시 저장!
                                await plugin.saveSettings();

                                plugin.enforcePhysicalSorting();
                            }).open();
                        });
                });
            }
        })
    );
}
