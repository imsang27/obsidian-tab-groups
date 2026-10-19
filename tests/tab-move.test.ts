import { describe, expect, it } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { findMovedLeaf } from '../src/tab-move';

// 💡 탭은 이름만 가진 가짜 객체로 충분 (같은 객체인지만 비교함)
const leaves = Object.fromEntries(
    ['a', 'b', 'c', 'd', 'e'].map(name => [name, { name } as unknown as WorkspaceLeaf]),
) as Record<'a' | 'b' | 'c' | 'd' | 'e', WorkspaceLeaf>;
const { a, b, c, d, e } = leaves;

describe('findMovedLeaf', () => {
    it('returns null when nothing moved', () => {
        expect(findMovedLeaf([a, b, c], [a, b, c], null)).toBeNull();
    });

    it('returns null when a tab was added or closed', () => {
        expect(findMovedLeaf([a, b, c], [a, b], null)).toBeNull();
    });

    it('finds a tab moved several places to the left', () => {
        expect(findMovedLeaf([a, b, c, d, e], [a, d, b, c, e], null)).toEqual({ leaf: d, from: 3, to: 1 });
    });

    it('finds a tab moved several places to the right', () => {
        expect(findMovedLeaf([a, b, c, d, e], [a, c, d, b, e], null)).toEqual({ leaf: b, from: 1, to: 3 });
    });

    it('uses the active tab when two neighbors swapped', () => {
        expect(findMovedLeaf([a, b, c], [b, a, c], b)).toEqual({ leaf: b, from: 1, to: 0 });
        expect(findMovedLeaf([a, b, c], [b, a, c], a)).toEqual({ leaf: a, from: 0, to: 1 });
    });

    it('returns null for a swap of neighbors when neither is active', () => {
        expect(findMovedLeaf([a, b, c], [b, a, c], c)).toBeNull();
    });

    it('returns null when more than one tab moved', () => {
        expect(findMovedLeaf([a, b, c, d], [b, a, d, c], null)).toBeNull();
    });
});
