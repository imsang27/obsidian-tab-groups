// Test-only helper for the E2E tests (not part of Tab Groups).
// Obsidian has no command to move a tab, so this adds two, with hotkeys, that swap the current tab
// with its neighbor the way Pane Relief's "Swap tab with previous/next" does.
const { Plugin } = require('obsidian');

module.exports = class MoveTabPlugin extends Plugin {
	onload() {
		this.addCommand({
			id: 'move-tab-left',
			name: 'Move tab left',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'PageUp' }],
			callback: () => this.move(-1),
		});
		this.addCommand({
			id: 'move-tab-right',
			name: 'Move tab right',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'PageDown' }],
			callback: () => this.move(1),
		});
	}

	move(step) {
		const leaf = this.app.workspace.getMostRecentLeaf();
		const parent = leaf && leaf.parent;
		if (!parent) return;
		const from = parent.children.indexOf(leaf);
		const to = from + step;
		if (to < 0 || to >= parent.children.length) return;
		parent.removeChild(leaf);
		parent.insertChild(to, leaf);
		parent.selectTabIndex(to);
	}
};
