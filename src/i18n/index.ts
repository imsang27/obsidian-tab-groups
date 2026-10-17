import { moment } from 'obsidian';
import en from './locales/en.json';
import ko from './locales/ko.json';

// ✨ 화면 문구 번역. 문구는 locales/<언어 코드>.json에 있고, 새 언어는 파일을 더한 뒤 LOCALES에 한 줄을 추가하면 됩니다.
// 영어(en.json)가 기준이며, 다른 언어에서 빠진 문구는 영어로 보입니다. (docs/translating.md 참고)
type StringKey = keyof typeof en;
type Translation = Partial<Record<StringKey, string>>;

// 💡 언어 코드는 옵시디언 화면 언어 코드와 같게 적습니다. (예: zh-tw, pt-br). name은 그 언어로 적은 이름
const LOCALES = {
    en: { name: 'English', strings: en },
    ko: { name: '한국어', strings: ko },
} satisfies Record<string, { name: string; strings: Translation }>;

export type Language = keyof typeof LOCALES;
// 💡 설정값: auto는 옵시디언 화면 언어를 따라감
export type LanguageSetting = 'auto' | Language;

// 💡 설정 탭의 언어 선택지에 보여 줄 이름
export const LANGUAGE_NAMES = Object.fromEntries(
    Object.entries(LOCALES).map(([lang, locale]) => [lang, locale.name]),
) as Record<Language, string>;

let current: Language = 'en';

function isLanguage(code: string): code is Language {
    return Object.prototype.hasOwnProperty.call(LOCALES, code);
}

// 💡 옵시디언 화면 언어 (옵시디언이 moment 로캘을 화면 언어로 맞춰 둠).
// 같은 코드(zh-tw)가 없으면 기본 언어(zh)로, 그것도 없으면 영어
function obsidianLanguage(): Language {
    const locale = moment.locale().toLowerCase();
    const base = locale.split('-')[0] ?? locale;
    if (isLanguage(locale)) return locale;
    if (isLanguage(base)) return base;
    return 'en';
}

export function setLanguage(setting: LanguageSetting) {
    current = setting === 'auto' ? obsidianLanguage() : setting;
}

export function t(key: StringKey, vars: Record<string, string> = {}): string {
    const strings: Translation = LOCALES[current].strings;
    const text = strings[key] || en[key];
    return text.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
