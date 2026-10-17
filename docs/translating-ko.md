# Tab Groups 번역하기

[English](./translating.md) | 한국어

번역에 참여해 주셔서 고맙습니다! 문구가 수십 개의 짧은 문장뿐이라 한 언어 전체를 번역해도 15분 정도면 됩니다. 따로 설치할 것 없이 깃허브 웹사이트에서 모두 할 수 있습니다.

## 문구가 있는 곳
---
언어마다 [`src/i18n/locales/`](../src/i18n/locales/)에 파일이 하나씩 있습니다.

* `en.json`: 기준이 되는 영어 문구입니다. 다른 언어는 모두 이 파일을 보고 번역합니다.
* `ko.json` 등: 번역된 문구입니다.

한 줄이 `"키": "문구"` 형태입니다. 오른쪽 문구만 번역하고 왼쪽 키는 그대로 두세요.

```json
{
    "menu.addToGroup": "Add to \"{name}\"",
    "settings.openTabs": "{count} open tabs"
}
```

* `{name}`, `{count}`처럼 중괄호로 감싼 말은 그대로 두세요. 플러그인이 그룹 이름이나 숫자로 바꿔 넣습니다. 문장 안에서 위치는 옮겨도 됩니다.
* 문구 안의 큰따옴표는 `\"`로 적습니다.
* 확실하지 않은 문구는 빼도 됩니다. 빠진 문구는 영어로 보입니다.
* 키를 보면 문구가 나오는 곳을 알 수 있습니다. `menu.*`는 탭 우클릭 메뉴, `modal.*`는 그룹 만들기·관리 창, `settings.*`는 플러그인 설정, `group.*`은 여러 곳에서 씁니다.

## 새 언어 추가하기
---
1. [옵시디언 언어 목록](https://github.com/obsidianmd/obsidian-translations#existing-languages)에서 언어 코드를 확인합니다. (예: 이탈리아어 `it`, 브라질 포르투갈어 `pt-BR`) 소문자로 씁니다: `it`, `pt-br`.
2. 깃허브에서 [`src/i18n/locales/en.json`](../src/i18n/locales/en.json)을 열어 내용을 복사하고, 같은 폴더에 `<코드>.json`(예: `it.json`) 파일을 새로 만드세요. 저장소 포크는 깃허브가 알아서 해 줍니다.
3. 문구를 번역합니다.
4. [`src/i18n/index.ts`](../src/i18n/index.ts)를 열어 기존 언어 옆 두 곳에 파일을 등록합니다.
    ```ts
    import it from './locales/it.json';
    ```
    ```ts
    const LOCALES = {
        en: { name: 'English', strings: en },
        ko: { name: '한국어', strings: ko },
        it: { name: 'Italiano', strings: it },
    };
    ```
    `name`은 그 언어로 적은 언어 이름이고, **언어** 설정에 표시됩니다.
5. 풀 리퀘스트를 올립니다. 자동 검사가 돌면서 키나 `{자리 표시자}`가 `en.json`과 다르면 알려 줍니다.

`index.ts`를 고치기 어렵다면 JSON 파일만 추가해서 풀 리퀘스트를 올려도 됩니다. 등록은 관리자가 해 드립니다.

## 기존 번역 고치기
---
> [!NOTE]
> 영어와 한국어를 뺀 번역은 처음에 AI의 도움을 받아 작성해서 정확하지 않을 수 있습니다. 어색하거나 틀린 표현이 있으면 고쳐 주세요. 원어민의 검토를 특히 환영합니다.

가장 쉬운 방법은 깃허브에서 그 언어의 파일을 열고 연필 아이콘(**Edit this file**)을 눌러 문구를 고친 뒤 변경을 제안하는 것입니다.

`en.json`에 새 문구가 생기면, 누군가 번역하기 전까지 다른 언어에서는 영어로 보입니다. 그 언어의 파일에서 문구를 더하거나 고친 뒤 풀 리퀘스트를 올려 주세요.

빠진 문구는 풀 리퀘스트의 **Translations** 검사에서 볼 수 있습니다. 요약에 번역률 표가 나오고, 문제가 있는 줄에는 파일에 직접 표시됩니다. 직접 실행해서 확인할 수도 있습니다.

```bash
npm install
npm run check-translations
```

## 풀 리퀘스트가 어렵다면
---
[번역 이슈](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=translation.yml)를 열고 번역한 내용을 붙여 넣어 주세요. 관리자가 대신 넣어 드립니다.

## 번역 확인하기 (선택)
---
1. 테스트용 보관함의 `.obsidian/plugins/` 폴더에 저장소를 복제하고 `npm install`, `npm run build`를 실행합니다.
2. 플러그인을 다시 불러온 뒤 **설정 → 커뮤니티 플러그인 → Tab Groups → 언어**에서 번역한 언어를 고릅니다.
3. 탭 우클릭 메뉴, 그룹 만들기·관리 창, 설정을 열어 문구가 잘리지 않고 자연스러운지 확인하세요.
