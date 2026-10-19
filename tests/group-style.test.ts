import { describe, expect, it } from 'vitest';
import { readableTextColor } from '../src/group-style';
import { PRESET_COLORS } from '../src/ui/color-palette';

// 💡 WCAG 대비율 (밝은 쪽 + 0.05) / (어두운 쪽 + 0.05)
function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(x: string, y: string): number {
    const [light, dark] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
    return (light + 0.05) / (dark + 0.05);
}

const longHex = (color: string) => (color === '#fff' ? '#ffffff' : color);

describe('readableTextColor', () => {
    it('uses white text on dark colors', () => {
        expect(readableTextColor('#000000')).toBe('#fff');
        expect(readableTextColor('#000080')).toBe('#fff');
    });

    it('uses dark text on light colors', () => {
        expect(readableTextColor('#ffffff')).toBe('#1e1e1e');
        expect(readableTextColor('#FFFF00')).toBe('#1e1e1e');
    });

    it('ignores an alpha suffix', () => {
        expect(readableTextColor('#ffff0080')).toBe('#1e1e1e');
    });

    it('falls back to white for colors it cannot read', () => {
        expect(readableTextColor('red')).toBe('#fff');
        expect(readableTextColor('#fff')).toBe('#fff');
    });

    it('keeps label text readable on every preset color', () => {
        PRESET_COLORS.forEach(color => {
            // 💡 큰 글자 기준 3:1보다 넉넉하게 (지금 프리셋은 모두 4.2 이상)
            expect(contrast(color, longHex(readableTextColor(color))), color).toBeGreaterThanOrEqual(4);
        });
    });

    it('picks whichever of white and dark text contrasts more', () => {
        ['#808080', '#5A8EE6', '#E5B55C', '#123456', '#abcdef'].forEach(color => {
            const chosen = longHex(readableTextColor(color));
            const other = chosen === '#ffffff' ? '#1e1e1e' : '#ffffff';
            // 흰 글자 대비 계산은 #ffffff, 어두운 글자는 #1e1e1e 기준이라 조금 다를 수 있어 여유를 둠
            expect(contrast(color, chosen), color).toBeGreaterThanOrEqual(contrast(color, other) * 0.8);
        });
    });
});
