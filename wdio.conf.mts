import * as os from 'os';
import * as path from 'path';

// E2E tests: launch a sandboxed Obsidian with this plugin and a test vault, then click and type like a user.
// Run `npm run test:e2e`. The first run downloads Obsidian into ~/.obsidian-cache (or OBSIDIAN_CACHE).
export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./tests/e2e/specs/**/*.e2e.ts'],
    maxInstances: 1,

    capabilities: [{
        browserName: 'obsidian',
        // OBSIDIAN_VERSION picks another Obsidian version, e.g. OBSIDIAN_VERSION=1.12.7 or earliest (manifest minAppVersion)
        browserVersion: process.env.OBSIDIAN_VERSION ?? 'latest',
        'wdio:obsidianOptions': {
            installerVersion: 'latest',
            // The test-only helper plugin adds hotkeys that move the current tab (tests/e2e/specs/move.e2e.ts)
            // Vertical Tabs (a community plugin) is installed disabled; tests/e2e/specs/vertical-tabs.e2e.ts turns it on to check compatibility
            plugins: ['.', 'tests/e2e/plugins/e2e-move-tab', { id: 'vertical-tabs', version: '0.18.6', enabled: false }],
            vault: 'tests/e2e/vault',
        },
        // 💡 Run Obsidian in English whatever the system language, so tests can find commands and buttons by name
        'goog:chromeOptions': {
            args: ['--lang=en'],
        },
    }],

    services: ['obsidian'],
    reporters: ['obsidian'],
    // Outside the repo, shared with other plugins' tests. On Windows, a folder whose permissions
    // block Electron's sandbox (for example under a sandboxed tool's folder) makes Obsidian exit at launch.
    cacheDir: process.env.OBSIDIAN_CACHE ?? path.join(os.homedir(), '.obsidian-cache'),
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
    },
    logLevel: 'warn',
};
