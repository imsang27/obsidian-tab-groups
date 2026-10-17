import { getLanguage } from 'obsidian';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt-br.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';
import zhTW from './locales/zh-tw.json';

// ✨ 화면 문구 번역. 문구는 locales/<언어 코드>.json에 있고, 새 언어는 파일을 더한 뒤 LOCALES에 한 줄을 추가하면 됩니다.
// 영어(en.json)가 기준이며, 다른 언어에서 빠진 문구는 영어로 보입니다. (docs/translating.md 참고)
type StringKey = keyof typeof en;
type Translation = Partial<Record<StringKey, string>>;

// 💡 언어 코드는 옵시디언 화면 언어 코드를 소문자로 적습니다. (예: zh-tw, pt-br). name은 그 언어로 적은 이름
const LOCALES = {
    en: { name: 'English', strings: en },
    de: { name: 'Deutsch', strings: de },
    es: { name: 'Español', strings: es },
    fr: { name: 'Français', strings: fr },
    'pt-br': { name: 'Português (Brasil)', strings: ptBR },
    ru: { name: 'Русский', strings: ru },
    ja: { name: '日本語', strings: ja },
    ko: { name: '한국어', strings: ko },
    zh: { name: '简体中文', strings: zh },
    'zh-tw': { name: '繁體中文', strings: zhTW },
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

// 💡 옵시디언 화면 언어 (설정 → 일반 → 언어에서 고른 언어 코드)
// 같은 코드(zh-tw)가 없으면 기본 언어(zh)로, 그것도 없으면 같은 계열(pt → pt-br)로, 그것도 없으면 영어
function obsidianLanguage(): Language {
    const locale = getLanguage().toLowerCase();
    const base = locale.split('-')[0] ?? locale;
    if (isLanguage(locale)) return locale;
    if (isLanguage(base)) return base;
    return (Object.keys(LOCALES) as Language[]).find(lang => lang.startsWith(`${base}-`)) ?? 'en';
}

export function setLanguage(setting: LanguageSetting) {
    current = setting === 'auto' ? obsidianLanguage() : setting;
}

export function t(key: StringKey, vars: Record<string, string> = {}): string {
    const strings: Translation = LOCALES[current].strings;
    const text = strings[key] || en[key];
    return text.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
