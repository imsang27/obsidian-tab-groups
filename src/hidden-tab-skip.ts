import { WorkspaceLeaf } from 'obsidian';
import type TabGroupsPlugin from './main';

type SetActiveLeaf = (leaf: WorkspaceLeaf, ...args: unknown[]) => void;
type ExecuteCommand = (command: { id: string }, ...args: unknown[]) => boolean;
interface InternalLeaf {
    parent?: { children?: WorkspaceLeaf[], selectTab?(leaf: WorkspaceLeaf): void };
}

// 💡 탭을 한 칸씩 옮겨 다니는 명령 (옵시디언 기본 Ctrl+Tab·Ctrl+Shift+Tab, Pane Relief 순환)
const CYCLE_COMMANDS = new Set([
    'workspace:next-tab',
    'workspace:previous-tab',
    'pane-relief:go-next',
    'pane-relief:go-prev',
]);

// ✨ 탭을 한 칸씩 옮겨 다닐 때 접힌 그룹의 탭을 건너뜁니다.
// 숨은 탭을 먼저 활성화한 뒤 다음 작업(setTimeout)에서 옮기면 그 사이 화면이 그려져 번쩍이므로,
// 순환 명령이 실행되는 동안 workspace.setActiveLeaf를 가로채 같은 작업 안에서 바로 다음에 보이는 탭으로 바꿉니다.
export function registerHiddenTabSkip(plugin: TabGroupsPlugin) {
    const workspace = plugin.app.workspace as unknown as { setActiveLeaf: SetActiveLeaf, activeLeaf: WorkspaceLeaf | null };
    const commands = (plugin.app as unknown as { commands: { executeCommand: ExecuteCommand } }).commands;
    let cycling = false;

    const originalExecute = commands.executeCommand;
    const patchedExecute: ExecuteCommand = function (this: unknown, command, ...args) {
        if (!CYCLE_COMMANDS.has(command?.id)) return originalExecute.call(this, command, ...args);
        cycling = true;
        try {
            return originalExecute.call(this, command, ...args);
        } finally {
            cycling = false;
        }
    };

    const originalSetActive = workspace.setActiveLeaf;
    const patchedSetActive: SetActiveLeaf = function (this: unknown, leaf, ...args) {
        const current = workspace.activeLeaf;
        const target = cycling ? visibleTarget(plugin, leaf, current) : null;
        if (!target) return originalSetActive.call(this, leaf, ...args);

        originalSetActive.call(this, target, ...args);
        // 갈 곳이 없어 지금 탭에 머물 때: 옵시디언이 이미 숨은 탭 화면으로 바꿔 두었으면 되돌립니다.
        if (target === current) (target as unknown as InternalLeaf).parent?.selectTab?.(target);
    };

    commands.executeCommand = patchedExecute;
    workspace.setActiveLeaf = patchedSetActive;
    plugin.register(() => {
        // 💡 다른 플러그인이 그 사이 다시 감쌌으면 건드리지 않습니다.
        if (commands.executeCommand === patchedExecute) commands.executeCommand = originalExecute;
        if (workspace.setActiveLeaf === patchedSetActive) workspace.setActiveLeaf = originalSetActive;
    });
}

// 💡 숨은 탭으로 한 칸 옮기려 하면, 같은 방향에서 처음 보이는 탭을 돌려줍니다. (없으면 지금 탭, 해당 없으면 null)
function visibleTarget(plugin: TabGroupsPlugin, leaf: WorkspaceLeaf, current: WorkspaceLeaf | null): WorkspaceLeaf | null {
    if (!current || current === leaf || !plugin.isLeafHidden(leaf)) return null;
    const children = (leaf as unknown as InternalLeaf).parent?.children;
    if (!children) return null;

    const from = children.indexOf(current);
    const to = children.indexOf(leaf);
    if (from === -1 || to === -1) return null;
    const last = children.length - 1;
    const direction =
        to === from + 1 || (from === last && to === 0) ? 1 :
        to === from - 1 || (from === 0 && to === last) ? -1 : 0;
    if (direction === 0) return null;

    for (let step = 1; step < children.length; step++) {
        const candidate = children[(to + direction * step + children.length) % children.length]!;
        if (candidate === current || !plugin.isLeafHidden(candidate)) return candidate;
    }
    return current;
}
