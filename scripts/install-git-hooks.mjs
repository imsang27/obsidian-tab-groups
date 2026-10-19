// Points git at the hooks in .githooks/ (currently a pre-push check). Runs on `npm install`.
// Does nothing outside a git checkout (for example in a downloaded release), and never fails the install.
import { execFileSync } from 'node:child_process';

try {
	execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
	execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
	// Not a git checkout, or git isn't installed: skip.
}
