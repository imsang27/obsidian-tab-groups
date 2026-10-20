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
        browserVersion: 'latest',
        'wdio:obsidianOptions': {
            installerVersion: 'latest',
            plugins: ['.'],
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
