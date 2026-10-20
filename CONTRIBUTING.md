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
| 💻 Code | See [Code contributions](#-code-contributions) below | Type check, build, lint and unit tests |

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
npm test
npm run check-translations
```

`npm install` also sets up a **pre-push hook** ([`.githooks/pre-push`](./.githooks/pre-push)) that runs the type check, lint, unit tests and translation check before every `git push`, the same checks as CI. If one fails, the push stops so you can fix it first. To skip it once, use `git push --no-verify`.

* **Discuss bigger changes first** in an issue, so your work fits the plugin's direction.
* **One topic per pull request.** Keep refactors separate from behavior changes.
* **Unit tests** live in [`tests/`](./tests) and cover logic that runs without Obsidian (group rules, saved tabs, translations, colors). If you change that logic, add or update a test. They run with [Vitest](https://vitest.dev); `npm test` runs them once.
* **E2E tests** live in [`tests/e2e/`](./tests/e2e). They launch a separate Obsidian with the plugin and a small test vault, then click, drag and type like a user: creating, collapsing, hiding and reopening groups, dragging tabs and group labels (also to another pane or a pop-out window, and splitting the view), moving tabs with hotkeys, the settings, and restoring groups after a restart. `npm run test:e2e` runs them (about 50 seconds). The first run downloads Obsidian into `~/.obsidian-cache` (or the folder in `OBSIDIAN_CACHE`). Set `OBSIDIAN_VERSION` (for example `1.12.7` or `earliest`) to test another Obsidian version.
  * **On Windows, you can run them without any window:** `npm run test:e2e:wsl` runs the same tests inside WSL on a virtual screen, like CI. No Obsidian window opens and nothing flashes in the taskbar, so you can keep working. It takes the same options (for example `npm run test:e2e:wsl -- --spec tests/e2e/specs/drag.e2e.ts`). One-time setup in WSL (Ubuntu): `sudo apt-get install -y xvfb libnss3 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxshmfence1`, then install Node.js with [nvm](https://github.com/nvm-sh/nvm) (`nvm install 24`). Your own Obsidian and vaults aren't touched. They also run in CI, on the latest Obsidian and on the oldest one the plugin supports (`minAppVersion`), so you don't have to run them before every push. If you change how something looks or behaves in Obsidian, add or update a test there.
* **Test in Obsidian** what the E2E tests don't cover yet, such as anything that depends on your theme.
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
| `src/group-actions.ts` | Group actions shared by the tab menu, commands, and labels (including reopen and delete) |
| `src/saved-tabs.ts` | Tabs a group remembers so a hidden group can be reopened |
| `src/hidden-tab-skip.ts`, `src/hidden-tab-activate.ts` | Skipping collapsed tabs when switching tabs, expanding a group when one of its tabs is opened directly |
| `src/explorer-open.ts` | Opening a note from the file explorer that is hidden in a collapsed group |
| `src/ui/` | The create/edit group windows and the color palette |
| `src/group-style.ts`, `src/internal.ts` | Shared helpers: group colors on tab headers, types for Obsidian's internal API |
| `src/settings.ts`, `src/settings-tab.ts` | Settings and the settings tab |
| `src/i18n/` | Translations |
| `tests/` | Unit tests (`tests/obsidian-stub.ts` stands in for the `obsidian` package) |

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
`main` requires the **build**, **e2e (latest)** and **e2e (earliest)** checks, so a pull request can't be merged until they pass, and nothing reaches `main` without them.

Merge pull requests without changing the version, and release only when there's something users should get.

[Dependabot](./.github/dependabot.yml) opens a few grouped pull requests each month to update the npm packages and GitHub Actions. They run the same required checks. Merge them when the checks pass. A major update gets its own pull request, so read its changes first.

1. On GitHub, go to **Actions → Release Obsidian plugin → Run workflow** and enter the new version (e.g. `1.3.7`).
2. The workflow makes the version commit on a temporary branch and runs the same checks as pull requests on it (build, lint, unit tests, and E2E on the latest and the oldest supported Obsidian), which takes a few minutes. Only if they all pass does it put the commit on `main`, tag it, build, and publish the release as Latest. If a check fails, nothing changes. The release notes list the pull requests merged since the last release.
3. On [community.obsidian.md](https://community.obsidian.md/account/plugins/tab-groups), select **Check for new releases** so the new version is reviewed.

## 📄 License
---
By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
