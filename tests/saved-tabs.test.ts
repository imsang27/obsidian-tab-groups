import { describe, expect, it } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { SavedTab, nextSavedTabs, renameSavedTabs, savedTabFile, snapshotLeaf } from '../src/saved-tabs';

const note = (file: string): SavedTab => ({ type: 'markdown', state: { file } });
const graph: SavedTab = { type: 'graph' };

describe('snapshotLeaf', () => {
    it('copies the view type and state', () => {
        const state = { file: 'a.md', mode: 'source' };
        const leaf = { getViewState: () => ({ type: 'markdown', state }) } as unknown as WorkspaceLeaf;
        const tab = snapshotLeaf(leaf);
        expect(tab).toEqual({ type: 'markdown', state: { file: 'a.md', mode: 'source' } });
        // 💡 나중에 탭 상태가 바뀌어도 기억한 값은 그대로여야 함
        expect(tab.state).not.toBe(state);
    });

    it('leaves out state when the view has none', () => {
        const leaf = { getViewState: () => ({ type: 'empty' }) } as unknown as WorkspaceLeaf;
        expect(snapshotLeaf(leaf)).toEqual({ type: 'empty' });
    });
});

describe('savedTabFile', () => {
    it('returns the note path', () => {
        expect(savedTabFile(note('folder/a.md'))).toBe('folder/a.md');
    });

    it('returns null for views without a file', () => {
        expect(savedTabFile(graph)).toBeNull();
        expect(savedTabFile({ type: 'markdown', state: { file: 42 } })).toBeNull();
    });
});

describe('renameSavedTabs', () => {
    it('follows a renamed note', () => {
        const tabs = [note('a.md'), note('b.md')];
        expect(renameSavedTabs(tabs, 'a.md', 'c.md')).toBe(true);
        expect(tabs.map(savedTabFile)).toEqual(['c.md', 'b.md']);
    });

    it('follows a renamed folder', () => {
        const tabs = [note('old/a.md'), note('old/sub/b.md'), note('older/c.md')];
        expect(renameSavedTabs(tabs, 'old', 'new')).toBe(true);
        expect(tabs.map(savedTabFile)).toEqual(['new/a.md', 'new/sub/b.md', 'older/c.md']);
    });

    it('returns false when nothing matches', () => {
        const tabs = [note('a.md'), graph];
        expect(renameSavedTabs(tabs, 'x.md', 'y.md')).toBe(false);
        expect(tabs.map(savedTabFile)).toEqual(['a.md', null]);
    });
});

describe('nextSavedTabs', () => {
    const a = note('a.md');
    const b = note('b.md');

    it('remembers the open tabs while the group has any', () => {
        expect(nextSavedTabs([a], [a, b], [b])).toEqual([a]);
    });

    it('keeps the remembered tabs when the group was already empty', () => {
        // 시작 직후나 이미 숨긴 그룹
        expect(nextSavedTabs([], [a, b], null)).toEqual([a, b]);
    });

    it('remembers the tabs that were closed when the last one closes', () => {
        expect(nextSavedTabs([], [a], [a])).toEqual([a]);
    });

    it('forgets the tabs when they were moved out rather than closed', () => {
        expect(nextSavedTabs([], [a, b], [])).toEqual([]);
    });
});
