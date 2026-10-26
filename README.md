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
* **Drag and drop:** Drag a single tab or a whole group (by its label). A placeholder shows exactly where it will land, in the group's color when the tab will join that group. Drop a group onto the edge of a pane to split it, or onto another pane's tab bar to move it there.

  ![Dragging the Reading group's label to the front of the tab bar, then dragging the Project group's label to the right edge of the pane, which splits the view and moves the group there](./docs/images/demo-drag.gif)

* **Join and leave groups as you move tabs:** Like Chrome, a tab joins an expanded group when you move it into the group, and leaves when you move it out. This works for drag and drop and for keyboard moves such as [Pane Relief](https://github.com/pjeby/pane-relief)'s "swap tab" commands. Collapsed groups are skipped as one block.
* **Open from the file explorer:** Clicking a note that is already open inside a collapsed group expands the group and switches to that tab instead of opening a new one.
* **Saved across restarts:** Groups, their colors, the tabs they contain, and their collapsed state are restored when Obsidian reopens.
* **Hide and reopen groups:** Like Chrome, hide a group to close its tabs while keeping the group. Reopen it later from the settings or the command palette, and its tabs come back in the same order. Renamed notes are followed.
* **Reopen closed tabs into their group:** Like Chrome, **Undo close tab** (Ctrl+Shift+T) puts a closed tab back in its group, in the same place. If you hid or deleted a whole group, it brings back the whole group with all its tabs.

  ![Hiding the Reading group from its label's menu, then reopening it from the command palette with Reopen a hidden group](./docs/images/demo-hide.gif)

* **Group sets:** Like workspaces, save your current groups (names, colors, collapsed state and tabs) as a named set, and open the set again later. Renamed notes are followed.
* **10 languages:** The tab menu and group windows follow the Obsidian language by default. You can pick a language in the plugin settings. [Help translate](./docs/translating.md) it into your language!
* **Pop-out windows:** Groups are shown and kept in pop-out windows too.
* **Works with [Vertical Tabs](https://github.com/oxdc/obsidian-vertical-tabs):** In its vertical tab list, grouped tabs get the group's color in the chosen group style and a header with the group's name and tab count. Click the header to collapse or expand the group, or right-click it for the group window. Right-clicking a tab in the list shows the same group items as the tab bar menu (remove from group, add to another group, create tab group). Dragging a tab in the list shows where it will go like in the tab bar, in the group's color when it will join the group. The slot follows the cursor like in the tab bar: past the middle of a row (or a group's header) puts the tab after it, and at the end of a group, the lower half of its last tab joins while further down stays out.

## 🚀 Usage
---
1. Right-click a tab and select **Create tab group**. Enter a name (optional) and pick a color.
2. To add another tab, right-click it and select **Add to "group name"**, or drag it into the group. To take a tab out, select **Remove from group** or drag it out.
3. Click the group label to collapse or expand it. Right-click the label to rename it or change its color, and to:
    * **Hide group:** close its tabs but keep the group, so you can reopen it later.
    * **Ungroup:** keep the tabs open as regular tabs and remove the group.
    * **Delete group:** close its tabs and delete the group (asks first).
    * **New tab in group:** open a new tab at the end of the group.
    * **Move to new window:** move the group with all its tabs to a new window.

### Commands
Run these from the command palette, or assign hotkeys in **Settings → Hotkeys**. Most of them work on the current tab.

* **Create tab group from the current tab**
* **Create tab group from all ungrouped tabs** (the tabs in the current pane that aren't in a group)
* **Group tabs by folder** (makes a group for each folder with two or more ungrouped tabs in the current pane, named after the folder)
* **Add the current tab to a group** (pick the group from a list)
* **Remove the current tab from its group**
* **Collapse or expand the current tab's group**
* **Edit the current tab's group**
* **Open a new tab in the current tab's group**
* **Move the current tab's group to a new window**
* **Reopen a hidden group** (pick the group from a list)
* **Hide the current tab's group**
* **Collapse all groups** / **Expand all groups**
* **Go to the next group** / **Go to the previous group** (the first tab of the next or previous group in the same pane, wrapping around at the ends. A collapsed group expands.)
* **Save the current groups as a set** / **Open a saved group set** / **Delete a saved group set** (opening adds the set's groups at the end of the current pane. Saving with an existing name replaces that set.)

## ⚙️ Settings
---
Open **Settings → Community plugins → Tab Groups**.

![Switching the group style from Underline to Classic, which changes the tab bar right away, then reopening the hidden Archive group from the group list](./docs/images/demo-settings.gif)

* **Language:** Auto (follows Obsidian), English, Deutsch, Español, Français, Português (Brasil), Русский, 日本語, 한국어, 简体中文, 繁體中文.
* **Group style:** **Underline** (default) shows a small label and a colored line under the group's tabs. **Classic** shows a colored line on top of each tab with a light tint.

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/group-styles-dark.png">
    <img alt="Underline (top) and Classic (bottom) group styles. In each style, the second row shows the first group collapsed." src="./docs/images/group-styles-light.png">
  </picture>

* **Tab count on group labels:** **Off** (default), **Collapsed groups**, or **All groups**. Shows how many tabs a group has next to its name, counting the hidden tabs of a collapsed group.
* **Remove a group when its last tab closes:** Off by default. When on, closing the last tab of a group deletes the group, like Chrome. When off, the group stays so you can add tabs to it again. Hidden groups are never removed.
* **Lock grouped tabs:** Off by default. When on, a note opened from a grouped tab (a link, the file explorer or the quick switcher) opens in a new tab outside the group, so the grouped tab keeps its note. Add the new tab to the group from the tab menu to lock it too. Tabs aren't pinned, so they stay where they are. Going back or forward inside a grouped tab still changes its note, and only tabs in the main window are locked.
* **Suggest a name and color for new groups:** Off by default. When on, the window for a new group fills in the folder of the tab's note as the name, with a color picked from that name, so the same folder always gets the same color (unless another group already uses it). Notes at the top of the vault get no name. You can still change both.
* **Tab groups:** Lists every group with the number of open tabs. Hidden groups show how many tabs they remember, with a **Reopen** button. Select **Delete group** to remove the ones you no longer need.
* **Group sets:** Lists every saved set with its number of groups and tabs. Type a name under **New set** and select **Save current groups** to save the current groups as a set (an existing name replaces that set). Select **Open** to open a set's groups at the end of the current pane, or **Delete set** to remove it (open tabs stay as they are).

## 📝 Scope
---
| | Works | Not supported or not tested |
|---|---|---|
| **Tabs** | Note tabs, empty tabs, and other views such as the graph | Sidebar tabs (left and right panels) can be grouped but haven't been fully tested |
| **Windows** | The main window and pop-out windows. Drag a group's label to move the whole group to another pane | |
| **Moving tabs** | Drag and drop, and keyboard moves such as [Pane Relief](https://github.com/pjeby/pane-relief)'s "swap tab" | |
| **Layouts** | The normal tab bar, and stacked tabs mode (group spines are tinted with the group's color, and the first one shows the group's name) | Collapsing a group in stacked tabs mode: its tabs stay visible there, and the group collapses again when you go back to the normal tab bar |
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
| English, Deutsch, Español, Français, Português (Brasil), Русский, 日本語, 简体中文, 繁體中文 | AI-assisted, not yet reviewed by native speakers |

> [!NOTE]
> Only the Korean text is written by a native speaker. The other languages, English included, were made with the help of AI and haven't been reviewed by native speakers yet, so they **may not be accurate**. If a string sounds wrong or unnatural, please help fix it.

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
