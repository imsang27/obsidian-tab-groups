import { Plugin, WorkspaceLeaf, Menu } from 'obsidian';

// 1. 데이터 구조 정의: 그룹 정보와 탭 매핑을 기억할 공간
interface TabGroupData {
    name: string;
    color: string;
    leafIds: Set<string>; // 이 그룹에 속한 탭(Leaf)들의 고유 ID 모음
}

export default class ChromeTabGroupsPlugin extends Plugin {
    // 메모리에 그룹 데이터를 임시 저장할 맵(Map)
    groups: Map<string, TabGroupData> = new Map();
    
    async onload() {
        console.log('🚀 Tab Groups 플러그인 로드됨 (수동 제어 모드)');

        // 테스트용: 옵시디언이 켜질 때 가상의 '프로젝트' 그룹 하나를 메모리에 만들어 둡니다.
        this.groups.set('group-1', {
            name: '프로젝트',
            color: '#ff5c5c', // 빨간색
            leafIds: new Set()
        });

        // 2. 우클릭 메뉴(Context Menu) 이벤트 가로채기
        // 사용자가 탭이나 화면 최상단을 우클릭할 때 발동합니다.
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.attachContextMenuToTabs();
            })
        );
    }

    attachContextMenuToTabs() {
        const tabHeaders = document.querySelectorAll('.workspace-tab-header');
        
        tabHeaders.forEach((header) => {
            const headerEl = header as HTMLElement;
            
            // 이미 우클릭 이벤트를 달아둔 탭은 건너뜁니다.
            if (headerEl.dataset.hasGroupMenu === 'true') return;

            // 탭에 마우스 우클릭(contextmenu) 이벤트 리스너 추가
            headerEl.addEventListener('contextmenu', (e: MouseEvent) => {
                // 기본 우클릭 메뉴에 우리가 만든 커스텀 메뉴를 추가로 띄우는 로직이 들어갈 곳
                console.log('🖱️ 탭 우클릭 감지됨! 메뉴를 띄울 준비를 합니다.');
            });

            headerEl.dataset.hasGroupMenu = 'true';
        });
    }

    onunload() {
        console.log('🛑 Tab Groups 플러그인 종료됨');
    }
}