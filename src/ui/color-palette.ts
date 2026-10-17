import { setGroupColor } from '../group-style';

// ✨ 수정: 묵직한 미드톤(Mid-tone) 색상으로 변경
export const PRESET_COLORS = [
    '#808080', // 그레이 (Gray)
    '#5A8EE6', // 파란색 (Blue)
    '#E66A6A', // 빨간색 (Red)
    '#E5B55C', // 노란색 (Yellow)
    '#6CB86C', // 초록색 (Green)
    '#E673B3', // 핑크색 (Pink)
    '#A478E6', // 보라색 (Purple)
    '#56B6C2', // 하늘색 (Sky Blue)
    '#E6955C'  // 주황색 (Orange)
];

// ✨ UX 개선: 스포이드 시작 색상이 항상 현재 선택된 색상과 동기화되도록 개선된 함수
export function renderColorPalette(containerEl: HTMLElement, currentColor: string, onChange: (newColor: string) => void) {
    // 💡 팔레트 모양(크기·테두리·호버 확대 등)은 styles.css의 .tab-group-color-* 클래스가 담당
    const paletteContainer = containerEl.createDiv({ cls: 'tab-group-color-palette' });

    let activeCircle: HTMLElement | null = null;
    let customInput: HTMLInputElement; // ✨ 아래에서 생성할 input을 미리 선언해둠 (스코프 공유)

    function updateActive(circle: HTMLElement) {
        activeCircle?.removeClass('is-selected');
        circle.addClass('is-selected');
        activeCircle = circle;
    }

    // 1. 프리셋 컬러 버튼들 생성
    PRESET_COLORS.forEach(color => {
        const circle = paletteContainer.createDiv({ cls: 'tab-group-color-swatch' });
        setGroupColor(circle, color);

        // 현재 색상과 일치하면 활성화 테두리 표시
        if (color.toLowerCase() === currentColor.toLowerCase()) {
            updateActive(circle);
        }

        circle.addEventListener('click', () => {
            updateActive(circle);
            if (customInput) customInput.value = color; // ✨ 프리셋 클릭 시 스포이드 시작 색상도 실시간 동기화!
            onChange(color);
        });
    });

    // 2. 커스텀 스포이드 버튼 생성
    const customWrapper = paletteContainer.createDiv({ cls: 'tab-group-color-custom' }); // 무지개색 커스텀 아이콘

    customInput = customWrapper.createEl('input', { type: 'color' });

    // ✨ 모달을 처음 열었을 때, 기존 그룹의 색상으로 스포이드(input) 시작 색상 세팅
    // (네이티브 input type="color"는 7자리 HEX 폼을 요구하므로 유효성 검사 추가)
    customInput.value = (currentColor && currentColor.length === 7) ? currentColor : '#000000';

    // 프리셋에 없는 색상일 경우 무지개 버튼에 활성화 테두리 표시
    const isPreset = PRESET_COLORS.some(c => c.toLowerCase() === currentColor.toLowerCase());
    if (!isPreset) {
        updateActive(customWrapper);
    }

    customInput.addEventListener('input', (e) => {
        const newColor = (e.target as HTMLInputElement).value;
        updateActive(customWrapper);
        onChange(newColor);
    });
}
