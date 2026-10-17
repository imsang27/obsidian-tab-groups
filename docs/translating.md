# Translating Tab Groups

English | [한국어](./translating-ko.md)

Thank you for helping translate Tab Groups! The plugin has only a few dozen short strings, so a full translation takes about 15 minutes. You don't need to install anything. You can do everything on the GitHub website.

## Where the strings are
---
Every language has one file in [`src/i18n/locales/`](../src/i18n/locales/):

* `en.json`: English, the source language. Every other file is translated from this one.
* `ko.json`, …: the translations.

Each line is `"key": "text"`. Translate only the text on the right. Leave the key on the left as it is.

```json
{
    "menu.addToGroup": "Add to \"{name}\"",
    "settings.openTabs": "{count} open tabs"
}
```

* Keep words in braces, such as `{name}` and `{count}`, exactly as they are. The plugin replaces them with a group name or a number. You can move them anywhere in the sentence.
* Write `\"` for a double quote inside the text.
* If you're not sure about a string, leave it out. Missing strings are shown in English.
* The key tells you where the string appears: `menu.*` is the tab right-click menu, `modal.*` is the create/edit group window, `settings.*` is the plugin settings, and `group.*` is used in several places.

## Add a new language
---
1. Find your language code. In Obsidian, select your language in **Settings → General → Language**, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (<kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>I</kbd> on macOS) to open the developer console, and enter `moment.locale()`. The result (for example `fr`) is your code. Use it in lowercase.
2. On GitHub, open [`src/i18n/locales/en.json`](../src/i18n/locales/en.json), copy its content, and create a new file in the same folder named `<code>.json` (for example `fr.json`). GitHub forks the repository for you.
3. Translate the text.
4. Open [`src/i18n/index.ts`](../src/i18n/index.ts) and register the file in two places, next to the existing languages:
    ```ts
    import fr from './locales/fr.json';
    ```
    ```ts
    const LOCALES = {
        en: { name: 'English', strings: en },
        ko: { name: '한국어', strings: ko },
        fr: { name: 'Français', strings: fr },
    };
    ```
    `name` is your language's name written in that language. It appears in the **Language** setting.
5. Open a pull request. A check runs automatically and tells you if a key or a `{placeholder}` doesn't match `en.json`.

If editing `index.ts` feels like too much, just add the JSON file and open the pull request. The maintainer will register it.

## Update an existing translation
---
When new strings are added to `en.json`, other languages show them in English until someone translates them. Edit the language's file, add or fix the strings, and open a pull request.

To see which strings are missing, look at the `npm run check-translations` step of the pull request check, or run it locally:

```bash
npm install
npm run check-translations
```

## Not comfortable with pull requests?
---
[Open a translation issue](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=translation.yml) and paste your translation there. The maintainer will add it for you.

## Test your translation (optional)
---
1. Clone the repository into your test vault's `.obsidian/plugins/` folder and run `npm install` and `npm run build`.
2. Reload the plugin, then pick your language in **Settings → Community plugins → Tab Groups → Language**.
3. Check the tab right-click menu, the create/edit group window, and the settings. Make sure the text fits and reads naturally.
