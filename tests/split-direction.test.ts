import { describe, expect, it } from 'vitest';
import { splitDirectionAt } from '../src/group-drag';

// 💡 (100, 50)에서 시작하는 400×200 편집 화면
const paneEl = (stacked: boolean) => ({
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }),
    closest: () => (stacked ? {} : null),
}) as unknown as HTMLElement;
const leafEl = paneEl(false);

describe('splitDirectionAt', () => {
    it('splits toward the edge within the outer 25%', () => {
        expect(splitDirectionAt(leafEl, 150, 150)).toBe('left');
        expect(splitDirectionAt(leafEl, 450, 150)).toBe('right');
        expect(splitDirectionAt(leafEl, 300, 60)).toBe('top');
        expect(splitDirectionAt(leafEl, 300, 240)).toBe('bottom');
    });

    it('does not split in the middle', () => {
        expect(splitDirectionAt(leafEl, 300, 150)).toBe('center');
    });

    it('prefers left and right in the corners', () => {
        expect(splitDirectionAt(leafEl, 120, 60)).toBe('left');
        expect(splitDirectionAt(leafEl, 480, 240)).toBe('right');
    });

    // 💡 쌓인 탭 묶음: 옵시디언처럼 왼쪽·오른쪽 분할 없음
    it('splits only up and down in stacked tabs, like Obsidian', () => {
        const stackedEl = paneEl(true);
        expect(splitDirectionAt(stackedEl, 150, 150)).toBe('center');
        expect(splitDirectionAt(stackedEl, 450, 150)).toBe('center');
        expect(splitDirectionAt(stackedEl, 120, 60)).toBe('top');
        expect(splitDirectionAt(stackedEl, 480, 240)).toBe('bottom');
    });
});
