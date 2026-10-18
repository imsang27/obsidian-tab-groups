# Tab Groups에 기여하기

[English](../CONTRIBUTING.md) | 한국어

Tab Groups를 함께 다듬어 주셔서 고맙습니다! 분야별로 기여하는 방법과, 자동으로 확인하는 항목을 정리했습니다.

## 기여할 수 있는 분야
---
| 분야 | 방법 | 자동 검사 |
| --- | --- | --- |
| 🐛 버그 제보 | [버그 제보 이슈 열기](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=bug_report.yml) | — |
| 💡 기능 제안 | [기능 제안 이슈 열기](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=feature_request.yml) | — |
| 🌐 번역 | [번역 가이드](./translating-ko.md) 참고 | 키, `{자리 표시자}`, JSON 형식 검사와 번역률 보고 |
| 📝 문서 | Markdown 파일을 고쳐 풀 리퀘스트 올리기 | 상대 링크 검사 |
| 💻 코드 | 아래 [코드 기여](#-코드-기여) 참고 | 타입 검사, 빌드, 린트 |

풀 리퀘스트에는 분야별 라벨이 자동으로 붙고, 바꾼 파일에 해당하는 검사만 돌아갑니다.

## 🐛 버그 제보와 💡 기능 제안
---
* 먼저 [기존 이슈](https://github.com/imsang27/obsidian-tab-groups/issues)에 같은 내용이 있는지 찾아봐 주세요.
* 버그는 옵시디언 버전, 플러그인 버전, 재현 순서를 적어 주세요. 탭을 바꾸는 다른 플러그인(Pane Relief 등)을 쓰고 있다면 함께 적어 주시면 도움이 됩니다.
* 이슈 하나에 버그나 아이디어 하나씩 적어 주세요.

## 💻 코드 기여
---
### 준비
1. **테스트용 보관함**의 `.obsidian/plugins/tab-groups/` 폴더에 저장소를 복제합니다. 평소 쓰는 보관함은 쓰지 마세요.
2. 설치하고 감시 모드로 빌드합니다.
    ```bash
    npm install
    npm run dev
    ```
3. 옵시디언 **설정 → 커뮤니티 플러그인**에서 **Tab Groups**를 켭니다. 코드를 바꿀 때마다 플러그인을 다시 불러오세요.

### 풀 리퀘스트를 올리기 전에
```bash
npm run build
npm run lint
npm run check-translations
```

* **큰 변경은 먼저 이슈에서 이야기해 주세요.** 플러그인 방향과 맞는지 미리 맞춰 볼 수 있습니다.
* **풀 리퀘스트 하나에 주제 하나.** 구조 정리와 동작 변경은 나눠 주세요.
* **옵시디언에서 직접 확인해 주세요.** 탭·그룹 끌기, 접기·펼치기, 옵시디언을 다시 켰을 때 그룹이 복원되는지 봐 주세요.
* **새 화면 문구**는 [`src/i18n/locales/en.json`](../src/i18n/locales/en.json)에 넣고 `t('키')`로 씁니다. 가능하면 `ko.json`에 한국어도 넣어 주세요. 다른 언어는 번역되기 전까지 영어로 보입니다.
* **정리**: 모든 리스너는 `register*` 도우미로 등록해서, 플러그인을 끄면 남는 게 없어야 합니다.
* `main.js`를 커밋하거나 버전을 바꾸지 **마세요.** 버전은 관리자가 릴리스할 때 올립니다.

### 코드 구조
| 파일 | 역할 |
| --- | --- |
| `src/main.ts` | 플러그인 수명 주기, 그룹 데이터, 저장·불러오기 |
| `src/group-layout.ts` | 그룹 탭을 한데 모아 정렬, 탭 바 감시 |
| `src/group-labels.ts` | 그룹 라벨: 접기·펼치기, 관리 창, 그룹 끌기 시작 |
| `src/group-drag.ts` | 그룹을 끄는 동안의 자리 표시와 분할 미리보기 |
| `src/group-drop.ts` | 그룹 놓기: 재배치, 다른 창으로 이동, 창 분할 |
| `src/tab-group-rules.ts` | 그룹 편입·이탈 공통 규칙 |
| `src/tab-drag.ts` | 탭 하나를 끌어 그룹에 넣거나 빼기 |
| `src/tab-move.ts` | 단축키(Pane Relief 등)로 탭을 옮길 때 그룹 편입·이탈 |
| `src/tab-menu.ts` | 탭 우클릭 메뉴의 그룹 항목 |
| `src/hidden-tab-skip.ts`, `src/hidden-tab-activate.ts` | 탭 전환 시 접힌 탭 건너뛰기, 숨은 탭을 직접 열면 그룹 펼치기 |
| `src/explorer-open.ts` | 접힌 그룹에 숨은 노트를 파일 탐색기에서 열 때 그 탭으로 이동 |
| `src/ui/` | 그룹 만들기·관리 창과 색 팔레트 |
| `src/group-style.ts`, `src/internal.ts` | 공용 도우미: 탭 헤더의 그룹 색, 옵시디언 내부 API 타입 |
| `src/settings.ts`, `src/settings-tab.ts` | 설정과 설정 화면 |
| `src/i18n/` | 번역 |

### 풀 리퀘스트 제목
풀 리퀘스트는 스쿼시 병합하고, 제목이 그대로 커밋 메시지가 됩니다. [gitmoji](https://gitmoji.dev/) + 타입(스코프) 형식으로 적어 주세요.

```
✨ feat(group-drag): 그룹을 창 가장자리에 놓을 때 분할 미리보기 표시
🐛 fix(tab-move): 접힌 그룹을 지나 탭을 옮겨도 그룹이 흩어지지 않게
🌐 feat(i18n): 이탈리아어 추가
📝 docs(readme): 언어 설정 설명 추가
```

영어나 한국어 모두 괜찮습니다. 잘 모르겠다면 병합할 때 관리자가 맞춰 드립니다.

## 🔖 릴리스 (관리자용)
풀 리퀘스트는 버전을 바꾸지 않고 병합하고, 사용자에게 전달할 변경이 있을 때만 릴리스합니다.

1. GitHub에서 **Actions → Release Obsidian plugin → Run workflow**를 누르고 새 버전(예: `1.3.7`)을 입력합니다.
2. 워크플로가 `main`의 버전을 올리고, 태그를 달고, 빌드해서 릴리스를 Latest로 게시합니다. 릴리스 노트에는 지난 릴리스 뒤에 병합된 풀 리퀘스트가 정리됩니다.
3. [community.obsidian.md](https://community.obsidian.md/account/plugins/tab-groups)에서 **Check for new releases**를 눌러 새 버전 검토를 시작합니다.

## 📄 라이선스
---
기여한 내용은 [MIT 라이선스](../LICENSE)를 따르는 데 동의한 것으로 봅니다.
