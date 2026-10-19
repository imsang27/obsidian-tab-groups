import { describe, expect, it } from 'vitest';
import { GroupSlot, resolveGroupAt } from '../src/tab-group-rules';

const tab = (groupId: string | null): GroupSlot => ({ groupId, isLabel: false });
const label = (groupId: string): GroupSlot => ({ groupId, isLabel: true });
// 💡 A는 펼쳐진 그룹, B는 접힌 그룹
const expanded = (groupId: string) => groupId === 'A';

describe('resolveGroupAt', () => {
    it('joins an expanded group right after its label', () => {
        expect(resolveGroupAt(label('A'), tab('A'), null, expanded)).toBe('A');
    });

    it('does not join a collapsed group after its label', () => {
        expect(resolveGroupAt(label('B'), tab(null), null, expanded)).toBeNull();
    });

    it('joins an expanded group between two of its tabs', () => {
        expect(resolveGroupAt(tab('A'), tab('A'), null, expanded)).toBe('A');
    });

    it('stays in its own group at the end of the group', () => {
        expect(resolveGroupAt(tab('A'), tab(null), 'A', expanded)).toBe('A');
        expect(resolveGroupAt(tab('A'), null, 'A', expanded)).toBe('A');
    });

    it('does not join a group when placed after its last tab', () => {
        expect(resolveGroupAt(tab('A'), tab(null), null, expanded)).toBeNull();
        expect(resolveGroupAt(tab('A'), label('B'), null, expanded)).toBeNull();
    });

    it('leaves the group anywhere else', () => {
        expect(resolveGroupAt(null, tab('A'), 'A', expanded)).toBeNull();
        expect(resolveGroupAt(tab(null), tab(null), 'A', expanded)).toBeNull();
        expect(resolveGroupAt(tab(null), label('A'), 'A', expanded)).toBeNull();
    });

    it('treats the next label as the start of another group, not a tab', () => {
        // 다음 요소가 라벨이면 같은 그룹 "탭 두 개 사이"가 아님
        expect(resolveGroupAt(tab('A'), label('A'), null, expanded)).toBeNull();
    });
});
