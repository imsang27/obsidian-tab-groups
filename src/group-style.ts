// 💡 그룹 색은 CSS 변수로만 넘깁니다. (색을 쓰는 방식은 styles.css가 정함)
export function setGroupColor(el: HTMLElement, color: string) {
    el.style.setProperty('--tab-group-color', color);
    el.style.setProperty('--tab-group-tint', `${color}1A`); // 1A = 약 10% 불투명도
}

// 💡 탭 헤더에서 이 플러그인이 붙인 그룹 표시를 모두 걷어 냅니다.
export function clearGroupHeader(header: HTMLElement) {
    header.removeAttribute('data-tab-group-id');
    header.removeClasses(['tab-group-member', 'tab-group-hidden', 'tab-group-drag-source']);
    header.style.removeProperty('--tab-group-color');
    header.style.removeProperty('--tab-group-tint');
    header.style.removeProperty('order');
    removeLegacyInlineColor(header);
}

// 💡 1.0.1 이하 버전이 탭 헤더에 직접 넣었던 색 스타일 (업데이트 뒤에도 남아 있을 수 있음)
export function removeLegacyInlineColor(header: HTMLElement) {
    header.style.removeProperty('border-top');
    header.style.removeProperty('background-color');
}
