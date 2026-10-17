// Checks every translation in src/i18n/locales against en.json (the source language).
// - Missing keys are reported but allowed: they fall back to English.
// - Invalid JSON, unknown keys, non-string values and changed {placeholders} are errors.
// - Keys in a different order than en.json are warnings (it keeps files easy to compare).
// On GitHub Actions, problems are shown on the file's lines and a coverage table goes to the run summary.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/i18n/locales/', import.meta.url);
const inCI = !!process.env.GITHUB_ACTIONS;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function lineOf(source, key) {
	const index = source.indexOf(`"${key}"`);
	return index < 0 ? 1 : source.slice(0, index).split('\n').length;
}

function report(level, file, line, message) {
	console.log(`  ${level}: ${message}`);
	if (inCI) console.log(`::${level} file=src/i18n/locales/${file},line=${line}::${message}`);
}

const en = JSON.parse(readFileSync(new URL('en.json', dir), 'utf8'));
const keys = Object.keys(en);
const rows = [];
let errors = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').sort()) {
	const lang = file.replace(/\.json$/, '');
	const source = readFileSync(new URL(file, dir), 'utf8');
	let strings;
	try {
		strings = JSON.parse(source);
	} catch (error) {
		console.log(`${lang}: invalid JSON`);
		report('error', file, 1, `Invalid JSON: ${error.message}`);
		errors++;
		rows.push(`| ${lang} | — | ❌ invalid JSON |`);
		continue;
	}

	const missing = keys.filter((key) => !strings[key]);
	const done = keys.length - missing.length;
	const percent = Math.floor((done / keys.length) * 100);
	console.log(`${lang}: ${done}/${keys.length} translated (${percent}%)`);
	missing.forEach((key) => console.log(`  missing: ${key}`));

	let fileErrors = 0;
	for (const [key, text] of Object.entries(strings)) {
		const line = lineOf(source, key);
		if (!(key in en)) {
			report('error', file, line, `Unknown key "${key}". It isn't in en.json; check the spelling or remove it.`);
			fileErrors++;
		} else if (typeof text !== 'string') {
			report('error', file, line, `"${key}" must be a string.`);
			fileErrors++;
		} else if (text && placeholders(text) !== placeholders(en[key])) {
			const expected = en[key].match(/\{\w+\}/g)?.join(' ') ?? '(none)';
			report('error', file, line, `"${key}" must keep the placeholders of en.json: ${expected}`);
			fileErrors++;
		}
	}

	const order = keys.filter((key) => key in strings);
	if (Object.keys(strings).filter((key) => key in en).join() !== order.join()) {
		report('warning', file, 1, 'Keys are in a different order than en.json. Keeping the same order makes files easier to compare.');
	}

	errors += fileErrors;
	const status = fileErrors > 0 ? `❌ ${fileErrors} error(s)` : missing.length > 0 ? `🚧 ${missing.length} missing` : '✅';
	rows.push(`| ${lang} | ${done}/${keys.length} (${percent}%) | ${status} |`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
	const summary = [
		'## 🌐 Translation coverage',
		'',
		'| Language | Translated | Status |',
		'| --- | --- | --- |',
		...rows,
		'',
		`Missing strings are shown in English. See the [translation guide](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/blob/main/docs/translating.md).`,
		'',
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
}

if (errors > 0) {
	console.error(`\n${errors} error(s) found.`);
	process.exit(1);
}
