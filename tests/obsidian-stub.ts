// 🧪 테스트용 'obsidian' 대역 (vitest.config.mts에서 연결)
// 테스트하는 모듈이 실제로 부르는 것만 흉내 냅니다.

let language = 'en';

// 💡 옵시디언 화면 언어를 바꾼 것처럼 합니다.
export function setMockLanguage(code: string) {
    language = code;
}

export function getLanguage(): string {
    return language;
}
