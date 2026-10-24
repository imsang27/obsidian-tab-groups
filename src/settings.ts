import type { LanguageSetting } from './i18n';
import type { GroupStyle } from './group-style';
import type { SavedTab } from './saved-tabs';
import type { GroupSet } from './group-sets';

// ✨ 플러그인이 data.json에 저장할 데이터의 형태를 정의
export interface SavedGroupData {
	id: string;
	name: string;
	color: string;
	isCollapsed: boolean;
	// 💡 그룹에 속한 탭(Leaf)의 고유 ID 목록
	savedTabs: string[];
	// 💡 그룹이 기억하는 탭 목록 (숨긴 그룹을 다시 열 때 씀. 1.4 이하 데이터에는 없음)
	tabs?: SavedTab[];
}

export const LABEL_TAB_COUNTS = ['off', 'collapsed', 'all'] as const;
export type LabelTabCount = typeof LABEL_TAB_COUNTS[number];

export interface TabGroupsSettings {
	savedGroups: SavedGroupData[];
	// 💡 화면 문구 언어 (auto: 옵시디언 언어를 따라감)
	language: LanguageSetting;
	// 💡 그룹 표시 모양 (underline: 그룹 탭 아래 색 밑줄, classic: 위쪽 색 줄과 옅은 배경)
	groupStyle: GroupStyle;
	// 💡 그룹 라벨에 탭 개수를 보일지 (off: 안 보임, collapsed: 접힌 그룹만, all: 모든 그룹)
	labelTabCount: LabelTabCount;
	// 💡 그룹의 마지막 탭을 닫으면 그룹도 지울지 (끄면 탭이 없어도 그룹을 남겨 다시 쓸 수 있음)
	removeEmptyGroups: boolean;
	// 💡 그룹 탭에서 연 노트가 그 탭을 바꾸지 않고 새 탭에 열리게 할지 (탭을 고정하지는 않음)
	lockGroupedTabs: boolean;
	// 💡 새 그룹 창에 탭 노트의 폴더 이름과 그 이름에서 정한 색을 미리 채울지
	suggestGroupName: boolean;
	// 💡 이름 붙여 저장해 둔 그룹 구성 (명령으로 저장·열기·삭제)
	groupSets: GroupSet[];
}

export const DEFAULT_SETTINGS: TabGroupsSettings = {
	savedGroups: [],
	language: 'auto',
	groupStyle: 'underline',
	labelTabCount: 'off',
	removeEmptyGroups: false,
	lockGroupedTabs: false,
	suggestGroupName: false,
	groupSets: [],
};
