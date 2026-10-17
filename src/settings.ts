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
}

export const DEFAULT_SETTINGS: TabGroupsSettings = {
	savedGroups: [],
};
