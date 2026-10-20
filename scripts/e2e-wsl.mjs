// Runs the E2E tests inside WSL on a virtual screen (xvfb), so on Windows no Obsidian window opens,
// nothing flashes in the taskbar, and clicking around can't disturb a test. Same setup as CI (Linux).
//
//   npm run test:e2e:wsl                                   all tests
//   npm run test:e2e:wsl -- --spec tests/e2e/specs/drag.e2e.ts
//   OBSIDIAN_VERSION=earliest npm run test:e2e:wsl         another Obsidian version
//
// Copies this folder (without node_modules, .git and build output) to ~/.cache/obsidian-tab-groups-e2e in WSL,
// installs packages there when package-lock.json changed, then runs `npm run test:e2e` under xvfb-run.
// Needs WSL with Node.js (nvm) and xvfb plus Electron's libraries. See CONTRIBUTING.md.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
	console.error('test:e2e:wsl is for Windows. On Linux, run: xvfb-run --auto-servernum npm run test:e2e');
	process.exit(1);
}

// C:\Users\me\repo → /mnt/c/Users/me/repo
const root = resolve('.');
const source = `/mnt/${root[0].toLowerCase()}${root.slice(2).replaceAll('\\', '/')}/`;
const quote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;
const args = process.argv.slice(2).map(quote).join(' ');
const version = process.env.OBSIDIAN_VERSION ? `OBSIDIAN_VERSION=${quote(process.env.OBSIDIAN_VERSION)} ` : '';

const script = `
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
case "$(command -v node)" in /mnt/*|"") echo "WSL has no Linux Node.js. Install it with nvm (see CONTRIBUTING.md)." >&2; exit 1;; esac
command -v xvfb-run >/dev/null || { echo "WSL has no xvfb-run. Install xvfb (see CONTRIBUTING.md)." >&2; exit 1; }

dest="$HOME/.cache/obsidian-tab-groups-e2e"
mkdir -p "$dest"
rsync -a --delete --exclude node_modules --exclude .git --exclude /main.js --exclude .obsidian-cache --exclude data.json --exclude .lock-hash ${quote(source)} "$dest/"
cd "$dest"
lock=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .lock-hash 2>/dev/null)" != "$lock" ]; then
	npm ci --no-audit --no-fund --ignore-scripts
	echo "$lock" > .lock-hash
fi
${version}xvfb-run --auto-servernum npm run test:e2e -- ${args}
`;

// 💡 The script goes in through stdin: quotes inside a command-line argument get mangled on the way to wsl.exe.
const result = spawnSync('wsl.exe', ['--', 'bash', '-s'], { input: script.replaceAll('\r', ''), stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(result.status ?? 1);
