# Tab Groups

English | [한국어](./docs/readme-ko.md)

Bring Chrome-like tab grouping, color-coding, and collapsible tab management into your Obsidian workspace.

Organize your messy tab bar by clustering related notes under labeled, color-mapped groups that can be expanded or collapsed with a single click.

## ✨ Features
---
* **Colored groups with labels:** Give a group of tabs a name and a color. A label sits in front of the group, and every tab in it shares the same color line.
* **Collapse and expand:** Click a group label to hide its tabs and free up space. Click again to bring them back in their original order. Switching tabs skips over collapsed groups.
* **Drag and drop:** Drag a single tab or a whole group (by its label). A placeholder shows exactly where it will land. Drop a group onto the edge of a pane to split it, or onto another pane's tab bar to move it there.
* **Join and leave groups as you move tabs:** Like Chrome, a tab joins an expanded group when you move it into the group, and leaves when you move it out. This works for drag and drop and for keyboard moves such as [Pane Relief](https://github.com/pjeby/pane-relief)'s "swap tab" commands. Collapsed groups are skipped as one block.
* **Open from the file explorer:** Clicking a note that is already open inside a collapsed group expands the group and switches to that tab instead of opening a new one.
* **Saved across restarts:** Groups, their colors, the tabs they contain, and their collapsed state are restored when Obsidian reopens.
* **English and Korean:** The tab menu and group windows follow the Obsidian language by default. You can pick a language in **Settings → Community plugins → Tab Groups → Language**.

## 🚀 Usage
---
1. Right-click a tab and select **Create tab group**. Enter a name (optional) and pick a color.
2. To add another tab, right-click it and select **Add to "group name"**, or drag it into the group. To take a tab out, select **Remove from group** or drag it out.
3. Click the group label to collapse or expand it. Right-click the label to rename it, change its color, ungroup or delete it, or close all of its tabs.

## 🛠️ Installation
---
### Manual installation
Until the plugin is listed in the Community Plugins catalog, you can install it manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/imsang27/obsidian-tab-groups/releases/latest).
2. In your vault, create the folder `.obsidian/plugins/tab-groups/` and put the files in it.
3. Restart Obsidian, go to **Settings → Community plugins**, and turn on **Tab Groups**.

The plugin is desktop-only.

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

## 📄 License
---
This project is licensed under the [MIT License](./LICENSE).
