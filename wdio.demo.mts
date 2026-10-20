import { config as e2e } from './wdio.conf.mjs';

// README demos: record the animated examples in docs/images with the real plugin (tests/e2e/demo).
// Run `npm run demo:wsl` on Windows, or `xvfb-run --auto-servernum npm run demo` on Linux. Not part of CI.
export const config: WebdriverIO.Config = {
    ...e2e,
    specs: ['./tests/e2e/demo/**/*.demo.ts'],
    capabilities: [{
        ...e2e.capabilities[0],
        'wdio:obsidianOptions': {
            installerVersion: 'latest',
            plugins: ['.'],
            vault: 'tests/e2e/demo/vault',
        },
    }],
    mochaOpts: { ...e2e.mochaOpts, timeout: 180000 },
};
