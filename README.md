# Tab Groups

English | [한국어](./docs/readme-ko.md)

Chrome-style tab groups for Obsidian. Name and color related tabs, and collapse them when you need the space.

![Tab Groups demo: grouping tabs, then collapsing and expanding groups by clicking their labels](./docs/images/tab-groups-demo.gif)

- 🏷️ **Group** · Right-click a tab → **Create tab group**. Pick a name and a color.
- 📁 **Collapse** · Click the label to hide the group's tabs. Click again to bring them back.
- ✋ **Move** · Drag the label to move the whole group, even to another pane.
- 💾 **Keep** · Groups and their state come back when Obsidian restarts.

## ✨ Features
---
* **Colored groups with labels:** Give a group of tabs a name and a color. A label sits in front of the group, and every tab in it shares the same color line.
* **Collapse and expand:** Click a group label to hide its tabs and free up space. Click again to bring them back in their original order. Switching tabs skips over collapsed groups.
* **Drag and drop:** Drag a single tab or a whole group (by its label). A placeholder shows exactly where it will land. Drop a group onto the edge of a pane to split it, or onto another pane's tab bar to move it there.
* **Join and leave groups as you move tabs:** Like Chrome, a tab joins an expanded group when you move it into the group, and leaves when you move it out. This works for drag and drop and for keyboard moves such as [Pane Relief](https://github.com/pjeby/pane-relief)'s "swap tab" commands. Collapsed groups are skipped as one block.
* **Open from the file explorer:** Clicking a note that is already open inside a collapsed group expands the group and switches to that tab instead of opening a new one.
* **Saved across restarts:** Groups, their colors, the tabs they contain, and their collapsed state are restored when Obsidian reopens.
* **10 languages:** The tab menu and group windows follow the Obsidian language by default. You can pick a language in the plugin settings. [Help translate](./docs/translating.md) it into your language!
* **Pop-out windows:** Groups are shown and kept in pop-out windows too.

## 🚀 Usage
---
1. Right-click a tab and select **Create tab group**. Enter a name (optional) and pick a color.
2. To add another tab, right-click it and select **Add to "group name"**, or drag it into the group. To take a tab out, select **Remove from group** or drag it out.
3. Click the group label to collapse or expand it. Right-click the label to rename it, change its color, ungroup or delete it, or close the group (this closes all of its tabs).

### Commands
Run these from the command palette, or assign hotkeys in **Settings → Hotkeys**. They work on the current tab.

* **Create tab group from the current tab**
* **Add the current tab to a group** (pick the group from a list)
* **Remove the current tab from its group**
* **Collapse or expand the current tab's group**
* **Edit the current tab's group**

## ⚙️ Settings
---
Open **Settings → Community plugins → Tab Groups**.

* **Language:** Auto (follows Obsidian), English, Deutsch, Español, Français, Português (Brasil), Русский, 日本語, 한국어, 简体中文, 繁體中文.
* **Group style:** **Underline** (default) shows a small label and a colored line under the group's tabs. **Classic** shows a colored line on top of each tab with a light tint.

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/group-styles-dark.png">
    <img alt="Underline (top) and Classic (bottom) group styles. In each style, the second row shows the first group collapsed." src="./docs/images/group-styles-light.png">
  </picture>

* **Tab groups:** Lists every group with the number of open tabs. Groups stay even when none of their tabs are open, so you can reuse them from the tab menu. Select **Delete group** to remove the ones you no longer need.

## 📝 Scope
---
| | Works | Not supported or not tested |
|---|---|---|
| **Tabs** | Note tabs, empty tabs, and other views such as the graph | Sidebar tabs (left and right panels) can be grouped but haven't been fully tested |
| **Windows** | The main window and pop-out windows. Drag a group's label to move the whole group to another pane | |
| **Moving tabs** | Drag and drop, and keyboard moves such as [Pane Relief](https://github.com/pjeby/pane-relief)'s "swap tab" | |
| **Layouts** | The normal tab bar | Stacked tabs mode (not tested) |
| **Platforms** | Desktop | Mobile |

A single tab that you move to another pane leaves its group, like in Chrome. The group stays in its original pane.

## 🛠️ Installation
---
Open **Settings → Community plugins → Browse**, search for **Tab Groups**, then select **Install** and **Enable**.

### Manual installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/imsang27/obsidian-tab-groups/releases/latest).
2. In your vault, create the folder `.obsidian/plugins/tab-groups/` and put the files in it.
3. Restart Obsidian, go to **Settings → Community plugins**, and turn on **Tab Groups**.

## 💻 Development
---
This project is built on the Obsidian sample plugin template.

1. Clone this repository into your test vault's `.obsidian/plugins/` folder.
2. Install dependencies:
    ```bash
    npm install
    ```
3. Build in watch mode:
    ```bash
    npm run dev
    ```

## 🌐 Translations
---
| Language | Status |
| --- | --- |
| 한국어 | Written by the maintainer (native speaker) |
| English | Written by the maintainer, not yet reviewed by native speakers |
| Deutsch, Español, Français, Português (Brasil), Русский, 日本語, 简体中文, 繁體中文 | AI-assisted, not yet reviewed by native speakers |

> [!NOTE]
> Only the Korean text is written by a native speaker. The English text hasn't been reviewed by native speakers yet, and the other translations were made with the help of AI, so they **may not be accurate**. If a string sounds wrong or unnatural, please help fix it.

Translations are welcome! Each language is a small JSON file in [`src/i18n/locales/`](./src/i18n/locales/), and you can edit it right on GitHub without installing anything.

* **Fix a translation:** Open your language's file, select the pencil icon (**Edit this file**), fix the text, and propose the change. GitHub opens a pull request for you.
* **Add a new language:** Copy `en.json` to a new file named with your language code and translate it.
* **Not comfortable with pull requests?** [Open a translation issue](https://github.com/imsang27/obsidian-tab-groups/issues/new?template=translation.yml) and describe the fix or paste your translation.

Missing strings are shown in English, so partial translations are fine. See the [translation guide](./docs/translating.md) for details.

## 🤝 Contributing
---
Bug reports, ideas, translations and code are all welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License
---
This project is licensed under the [MIT License](./LICENSE).
