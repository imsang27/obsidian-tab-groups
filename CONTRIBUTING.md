# Contributing to Tab Groups

English | [한국어](./docs/contributing-ko.md)

Thank you for helping improve Tab Groups! This guide explains how to contribute in each area and what is checked automatically.

## Ways to contribute
---
| Area | How | Automatic checks |
| --- | --- | --- |
| 🐛 Bug reports | [Open a bug report](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=bug_report.yml) | — |
| 💡 Feature ideas | [Suggest a feature](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=feature_request.yml) | — |
| 🌐 Translations | See the [translation guide](./docs/translating.md) | Keys, `{placeholders}` and JSON format, with a coverage report |
| 📝 Documentation | Edit the Markdown files and open a pull request | Relative links |
| 💻 Code | See [Code contributions](#-code-contributions) below | Type check, build and lint |

Pull requests are labeled by area automatically, and only the checks for the files you changed run.

## 🐛 Bug reports and 💡 feature ideas
---
* Search the [existing issues](https://github.com/imsang27/obsidian-tab-groups/issues) first.
* For bugs, include your Obsidian and plugin versions and the steps to reproduce. Other plugins that change tabs (such as Pane Relief) are useful to mention.
* One issue per bug or idea.

## 💻 Code contributions
---
### Setup
1. Clone this repository into a **test vault's** `.obsidian/plugins/tab-groups/` folder. Don't use your main vault.
2. Install and build in watch mode:
    ```bash
    npm install
    npm run dev
    ```
3. In Obsidian, turn on **Tab Groups** in **Settings → Community plugins**. Reload the plugin after each change.

### Before you open a pull request
```bash
npm run build
npm run lint
npm run check-translations
```

* **Discuss bigger changes first** in an issue, so your work fits the plugin's direction.
* **One topic per pull request.** Keep refactors separate from behavior changes.
* **Test in Obsidian**: dragging tabs and groups, collapsing and expanding, and restarting Obsidian (groups must be restored).
* **New UI text** goes in [`src/i18n/locales/en.json`](./src/i18n/locales/en.json) and is used with `t('key')`. Add the Korean text to `ko.json` if you can. Other languages fall back to English until they are translated.
* **Clean up** every listener with the `register*` helpers so that disabling the plugin leaves nothing behind.
* **Don't** commit `main.js` or change the version. The maintainer bumps the version when releasing.

### Code structure
| File | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin lifecycle, group data, saving and loading |
| `src/group-layout.ts` | Keeping each group's tabs together, tab bar observers |
| `src/group-labels.ts` | Group labels: collapse and expand, the edit window, starting a group drag |
| `src/group-drag.ts` | Placeholder and split preview while dragging a group |
| `src/group-drop.ts` | Dropping a group: reorder, move to another pane, split |
| `src/tab-group-rules.ts` | The shared rule for joining and leaving groups |
| `src/tab-drag.ts` | Dragging a single tab into or out of a group |
| `src/tab-move.ts` | Joining and leaving groups when tabs move by keyboard (e.g. Pane Relief) |
| `src/tab-menu.ts` | Group items in the tab right-click menu |
| `src/commands.ts` | Commands for the command palette and hotkeys |
| `src/group-actions.ts` | Group actions shared by the tab menu, commands, and labels |
| `src/hidden-tab-skip.ts`, `src/hidden-tab-activate.ts` | Skipping collapsed tabs when switching tabs, expanding a group when one of its tabs is opened directly |
| `src/explorer-open.ts` | Opening a note from the file explorer that is hidden in a collapsed group |
| `src/ui/` | The create/edit group windows and the color palette |
| `src/group-style.ts`, `src/internal.ts` | Shared helpers: group colors on tab headers, types for Obsidian's internal API |
| `src/settings.ts`, `src/settings-tab.ts` | Settings and the settings tab |
| `src/i18n/` | Translations |

### Pull request titles
Pull requests are squash-merged, and the title becomes the commit message. Use the [gitmoji](https://gitmoji.dev/) + type(scope) format:

```
✨ feat(group-drag): show a split preview when dropping a group on a pane edge
🐛 fix(tab-move): keep a collapsed group together when moving a tab past it
🌐 feat(i18n): add Italian
📝 docs(readme): explain the language setting
```

English or Korean is fine. If you're not sure, the maintainer will adjust the title when merging.

## 🔖 Releasing (maintainer)
Merge pull requests without changing the version, and release only when there's something users should get.

1. On GitHub, go to **Actions → Release Obsidian plugin → Run workflow** and enter the new version (e.g. `1.3.7`).
2. The workflow bumps the version on `main`, tags it, builds, and publishes the release as Latest. The release notes list the pull requests merged since the last release.
3. On [community.obsidian.md](https://community.obsidian.md/account/plugins/tab-groups), select **Check for new releases** so the new version is reviewed.

## 📄 License
---
By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
