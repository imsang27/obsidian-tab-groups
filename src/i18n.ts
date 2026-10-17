import { moment } from 'obsidian';

// ✨ 화면 문구 번역. 새 언어는 Language에 코드를 더하고 STRINGS에 같은 키로 문구를 채우면 됩니다.
export type Language = 'en' | 'ko';
// 💡 설정값: auto는 옵시디언 화면 언어를 따라감
export type LanguageSetting = 'auto' | Language;

const EN = {
    // 탭 우클릭 메뉴
    'menu.removeFromGroup': 'Remove from group',
    'menu.addToGroup': 'Add to "{name}"',
    'menu.addToUnnamedGroup': 'Add to unnamed group',
    'menu.createGroup': 'Create tab group',
    // 그룹 만들기·관리 창
    'modal.createTitle': 'Create tab group',
    'modal.editTitle': 'Edit tab group',
    'modal.name': 'Name',
    'modal.nameDesc': 'Leave empty to show only a colored label.',
    'modal.color': 'Color',
    'modal.create': 'Create',
    'modal.save': 'Save',
    'modal.actions': 'Group actions',
    'modal.closeGroup': 'Close group',
    'modal.closeGroupTip': 'Close all tabs in the group and delete the group.',
    'modal.deleteGroup': 'Delete group',
    'modal.deleteGroupTip': 'Keep the tabs open as regular tabs and delete the group.',
    'modal.ungroup': 'Ungroup',
    'modal.ungroupTip': 'Keep the tabs open as regular tabs. The empty group stays available in the tab menu.',
    // 설정 탭
    'settings.language': 'Language',
    'settings.languageDesc': 'Language of the tab menu and group windows. Auto follows the Obsidian language.',
    'settings.languageAuto': 'Auto (Obsidian language)',
    'settings.groups': 'Tab groups',
    'settings.groupsDesc': 'Groups are kept even when none of their tabs are open, so you can add tabs to them again from the tab menu. Delete the ones you no longer need.',
    'settings.noGroups': 'No groups yet. Right-click a tab and select "Create tab group".',
    'settings.openTabs': '{count} open tabs',
    'settings.delete': 'Delete',
    'settings.deleteTip': 'Delete the group. Its tabs stay open as regular tabs.',
    'group.unnamed': 'Unnamed group',
};

type StringKey = keyof typeof EN;

const KO: Record<StringKey, string> = {
    'menu.removeFromGroup': '그룹에서 제외',
    'menu.addToGroup': '"{name}" 그룹에 넣기',
    'menu.addToUnnamedGroup': '이름 없는 그룹에 넣기',
    'menu.createGroup': '새 탭 그룹 만들기',
    'modal.createTitle': '새 탭 그룹 만들기',
    'modal.editTitle': '탭 그룹 관리',
    'modal.name': '이름',
    'modal.nameDesc': '비워 두면 색상만 있는 라벨이 만들어집니다.',
    'modal.color': '색상',
    'modal.create': '만들기',
    'modal.save': '저장',
    'modal.actions': '그룹 작업',
    'modal.closeGroup': '그룹 닫기',
    'modal.closeGroupTip': '그룹의 탭을 모두 닫고 그룹도 삭제합니다.',
    'modal.deleteGroup': '그룹 삭제',
    'modal.deleteGroupTip': '탭은 일반 탭으로 남기고 그룹을 삭제합니다.',
    'modal.ungroup': '그룹 해제',
    'modal.ungroupTip': '탭은 일반 탭으로 남깁니다. 빈 그룹은 탭 메뉴에서 계속 쓸 수 있습니다.',
    'settings.language': '언어',
    'settings.languageDesc': '탭 메뉴와 그룹 창의 언어입니다. 자동은 옵시디언 언어를 따릅니다.',
    'settings.languageAuto': '자동 (옵시디언 언어)',
    'settings.groups': '탭 그룹',
    'settings.groupsDesc': '열린 탭이 없어도 그룹은 남아 있어서, 탭 메뉴에서 다시 탭을 넣을 수 있습니다. 더 쓰지 않는 그룹은 여기서 지우세요.',
    'settings.noGroups': '아직 그룹이 없습니다. 탭을 우클릭해 "새 탭 그룹 만들기"를 선택하세요.',
    'settings.openTabs': '열린 탭 {count}개',
    'settings.delete': '삭제',
    'settings.deleteTip': '그룹을 삭제합니다. 탭은 일반 탭으로 남습니다.',
    'group.unnamed': '이름 없는 그룹',
};

const STRINGS: Record<Language, Record<StringKey, string>> = { en: EN, ko: KO };

// 💡 설정 탭의 언어 선택지에 보여 줄 이름 (각 언어로 적음)
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ko: '한국어' };

let current: Language = 'en';

// 💡 옵시디언 화면 언어 (옵시디언이 moment 로캘을 화면 언어로 맞춰 둠). 지원하지 않는 언어면 영어
function obsidianLanguage(): Language {
    const locale = moment.locale().toLowerCase();
    return (Object.keys(STRINGS) as Language[]).find(lang => locale === lang || locale.startsWith(`${lang}-`)) ?? 'en';
}

export function setLanguage(setting: LanguageSetting) {
    current = setting === 'auto' ? obsidianLanguage() : setting;
}

export function t(key: StringKey, vars: Record<string, string> = {}): string {
    const text = STRINGS[current][key] ?? EN[key];
    return text.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
