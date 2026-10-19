import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGE_NAMES, Language, setLanguage, t } from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import { setMockLanguage } from './obsidian-stub';

afterEach(() => {
    setMockLanguage('en');
    setLanguage('en');
});

describe('t', () => {
    it('returns the text in the chosen language', () => {
        setLanguage('ko');
        expect(t('settings.language')).toBe('언어');
        setLanguage('en');
        expect(t('settings.language')).toBe(en['settings.language']);
    });

    it('fills in placeholders', () => {
        setLanguage('en');
        expect(t('settings.openTabs', { count: '3' })).toBe('3 open tabs');
    });

    it('leaves unknown placeholders as they are', () => {
        setLanguage('en');
        expect(t('settings.openTabs')).toBe('{count} open tabs');
    });
});

describe('setLanguage("auto")', () => {
    const cases: [obsidian: string, expected: string][] = [
        ['ko', 'ko'],
        ['zh-TW', 'zh-tw'], // 같은 코드
        ['zh', 'zh'],
        ['de-AT', 'de'], // 기본 언어로
        ['pt', 'pt-br'], // 같은 계열로
        ['en-GB', 'en'],
        ['ar', 'en'], // 없는 언어는 영어
    ];

    it.each(cases)('maps Obsidian language %s to %s', (obsidian, expected) => {
        expect(expected in LANGUAGE_NAMES).toBe(true);
        // 💡 지금 언어는 바깥에서 볼 수 없어서, 그 언어를 직접 골랐을 때와 같은 문구가 나오는지로 확인
        setLanguage(expected as Language);
        const direct = t('settings.languageDesc');
        setMockLanguage(obsidian);
        setLanguage('auto');
        expect(t('settings.languageDesc')).toBe(direct);
    });
});
