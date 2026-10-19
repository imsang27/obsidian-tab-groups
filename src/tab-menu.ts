import { Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';
import { t } from './i18n';
import { addToGroup, createGroupWith, removeFromGroup } from './group-actions';

// ✨ 탭 우클릭 메뉴에 그룹 항목(그룹에서 제외, 다른 그룹에 넣기, 새 탭 그룹 만들기)을 더합니다.
// 옵시디언은 탭 헤더의 file-menu 이벤트에 어떤 탭인지 알려 주지 않으므로, 우클릭한 탭을 먼저 기억해 둡니다.
// 💡 선택되지 않은 탭을 우클릭하면 옵시디언은 file-menu 없이 짧은 메뉴(닫기 등)만 띄웁니다.
// 그때는 메뉴가 뜨기 직전(showAtMouseEvent)에 같은 항목을 넣습니다.
export function registerTabMenu(plugin: TabGroupsPlugin) {
    let lastClickedLeaf: WorkspaceLeaf | null = null;
    let lastContextEvent: MouseEvent | null = null;
    const handledMenus = new WeakSet<Menu>();

    plugin.registerDomEvent(window, 'contextmenu', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const header = target.closest<HTMLElement>('.workspace-tab-header');
        lastClickedLeaf = header ? plugin.findLeafFromHeader(header) : null;
        lastContextEvent = lastClickedLeaf ? e : null;
    }, { capture: true });

    plugin.registerEvent(
        plugin.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string) => {
            if (source === 'tab-header' && lastClickedLeaf) {
                handledMenus.add(menu);
                addGroupItems(plugin, menu, lastClickedLeaf);
            }
        })
    );

    // 💡 우클릭한 그 이벤트로 뜨는 메뉴만 건드립니다. 플러그인을 끄면 원래 함수로 되돌립니다.
    const proto = Menu.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 원래 함수를 this와 함께 다시 부르려고 꺼내 둠
    const showAtMouseEvent = proto.showAtMouseEvent;
    proto.showAtMouseEvent = function (this: Menu, evt: MouseEvent) {
        if (evt === lastContextEvent && lastClickedLeaf && !handledMenus.has(this)) {
            handledMenus.add(this);
            addGroupItems(plugin, this, lastClickedLeaf);
        }
        return showAtMouseEvent.call(this, evt);
    };
    plugin.register(() => { proto.showAtMouseEvent = showAtMouseEvent; });
}

function addGroupItems(plugin: TabGroupsPlugin, menu: Menu, targetLeaf: WorkspaceLeaf) {
    const currentGroupId = plugin.leafGroupMap.get(targetLeaf);

    menu.addSeparator();

    if (currentGroupId) {
        menu.addItem((item) => {
            item.setTitle(t('menu.removeFromGroup'))
                .setIcon('folder-minus')
                .onClick(() => { void removeFromGroup(plugin, targetLeaf); });
        });
        menu.addSeparator();
    }

    if (plugin.groups.size > 0) {
        plugin.groups.forEach((groupData, groupId) => {
            if (groupId !== currentGroupId && !plugin.isGroupHidden(groupId)) { // 💡 숨은 그룹은 빼고
                menu.addItem((item) => {
                    item.setTitle(groupData.name ? t('menu.addToGroup', { name: groupData.name }) : t('menu.addToUnnamedGroup'))
                        .setIcon('folder-input')
                        .onClick(() => { void addToGroup(plugin, targetLeaf, groupId); });
                });
            }
        });
        menu.addSeparator();
    }

    menu.addItem((item) => {
        item.setTitle(t('menu.createGroup'))
            .setIcon('folder-plus')
            .onClick(() => createGroupWith(plugin, targetLeaf));
    });
}
