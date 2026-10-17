import type { LanguageSetting } from './i18n';

// ✨ 플러그인이 data.json에 저장할 데이터의 형태를 정의
export interface SavedGroupData {
	id: string;
	name: string;
	color: string;
	isCollapsed: boolean;
	// 💡 그룹에 속한 탭(Leaf)의 고유 ID 목록
	savedTabs: string[];
}

export interface TabGroupsSettings {
	savedGroups: SavedGroupData[];
	// 💡 화면 문구 언어 (auto: 옵시디언 언어를 따라감)
	language: LanguageSetting;
}

export const DEFAULT_SETTINGS: TabGroupsSettings = {
	savedGroups: [],
	language: 'auto',
};
