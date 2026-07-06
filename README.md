# Obsidian Tab Groups (Chrome-Style)

English | [한국어](./README_ko.md)

Bring Chrome-like intuitive tab grouping, color-coding, and collapsible tab management into your Obsidian workspace. 

Organize your messy tab bar by clustering related notes under labeled, color-mapped groups that can be expanded or collapsed with a single click.

## ✨ Features (WIP)
---
* **Visual Identity (Color Mapping & Labels):** Assign distinct colors and custom text labels to groups of tabs. A colored bar aligns horizontally across matching leaves to signal cohesion.
* **Collapsible Interaction (Accordion Tabs):** Click on a group label to collapse its member tabs out of sight, freeing up horizontal real estate. Click again to expand them right back to their original slots.
* **State Persistence:** Your established tab groups and their toggle states (expanded/collapsed) are automatically saved and restored when Obsidian reopens.
* **Workspace Synchronization:** Fully syncs with your layouts without clashing with standard community themes.

## 🛠️ Installation
---
### Manual Installation
Since this plugin is currently under active development and not yet submitted to the official Community Plugins catalog, you can install it manually:

1.  Download the latest release files (`main.js`, `manifest.json`, `styles.css`).
2.  Navigate to your Obsidian vault's plugin directory: `.obsidian/plugins/`.
3.  Create a folder named `obsidian-tab-groups` and place the downloaded files inside.
4.  Open Obsidian, go to **Settings > Community Plugins**, and toggle on **Tab Groups (Chrome-Style)**.

## 💻 Development
---
This project is built using the Obsidian Sample Plugin boilerplate.

### Getting Started
1. Clone this repository into your test vault's plugin folder.
2. Install dependencies:
    ```bash
    npm install
    ```
3. Run the development build with hot-reloading:
    ```bash
    npm run dev
    ```

## 📄 License
---
This project is licensed under the MIT License.
