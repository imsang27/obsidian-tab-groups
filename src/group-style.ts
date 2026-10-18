// 💡 그룹 표시 모양. 밑줄이 기본이고, 클래식은 body에 클래스를 붙여 styles.css에서 고릅니다.
export const GROUP_STYLES = ['underline', 'classic'] as const;
export type GroupStyle = typeof GROUP_STYLES[number];

export function applyGroupStyle(doc: Document, style: GroupStyle | null) {
    doc.body.toggleClass('tab-groups-style-classic', style === 'classic');
}

// 💡 그룹 색은 CSS 변수로만 넘깁니다. (색을 쓰는 방식은 styles.css가 정함)
export function setGroupColor(el: HTMLElement, color: string) {
    el.style.setProperty('--tab-group-color', color);
    el.style.setProperty('--tab-group-tint', `${color}1A`); // 1A = 약 10% 불투명도
    el.style.setProperty('--tab-group-on-color', readableTextColor(color));
}

// 💡 그룹 색 위에 올릴 글자색: 흰색·검은색 중 대비가 더 큰 쪽 (노란색처럼 밝은 색엔 검은 글자)
function readableTextColor(color: string): string {
    const hex = /^#([0-9a-f]{6})/i.exec(color)?.[1];
    if (!hex) return '#fff';
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // 흰 글자 대비 (1.05 / (L + 0.05)) vs 검은 글자 대비 ((L + 0.05) / 0.05)
    return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#fff' : '#1e1e1e';
}

// 💡 탭 헤더에서 이 플러그인이 붙인 그룹 표시를 모두 걷어 냅니다.
export function clearGroupHeader(header: HTMLElement) {
    header.removeAttribute('data-tab-group-id');
    header.removeClasses(['tab-group-member', 'tab-group-hidden', 'tab-group-drag-source', 'tab-group-first', 'tab-group-last']);
    header.style.removeProperty('--tab-group-color');
    header.style.removeProperty('--tab-group-tint');
    header.style.removeProperty('--tab-group-on-color');
    header.style.removeProperty('order');
    removeLegacyInlineColor(header);
}

// 💡 1.0.1 이하 버전이 탭 헤더에 직접 넣었던 색 스타일 (업데이트 뒤에도 남아 있을 수 있음)
export function removeLegacyInlineColor(header: HTMLElement) {
    header.style.removeProperty('border-top');
    header.style.removeProperty('background-color');
}
