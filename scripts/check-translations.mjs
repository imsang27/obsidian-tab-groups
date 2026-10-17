// Checks every translation in src/i18n/locales against en.json (the source language).
// - Missing keys are reported but allowed: they fall back to English.
// - Unknown keys, non-string values and changed {placeholders} are errors.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/i18n/locales/', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const en = read('en.json');
const keys = Object.keys(en);
let errors = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').sort()) {
	const lang = file.replace(/\.json$/, '');
	const strings = read(file);
	const problems = [];
	const missing = keys.filter((key) => !strings[key]);

	for (const [key, text] of Object.entries(strings)) {
		if (!(key in en)) problems.push(`unknown key "${key}"`);
		else if (typeof text !== 'string') problems.push(`"${key}" must be a string`);
		else if (text && placeholders(text) !== placeholders(en[key])) {
			problems.push(`"${key}" must keep the placeholders of en.json: ${en[key].match(/\{\w+\}/g)?.join(' ') ?? '(none)'}`);
		}
	}

	const done = keys.length - missing.length;
	console.log(`${lang}: ${done}/${keys.length} translated (${Math.floor((done / keys.length) * 100)}%)`);
	missing.forEach((key) => console.log(`  missing: ${key}`));
	problems.forEach((problem) => console.log(`  error: ${problem}`));
	errors += problems.length;
}

if (errors > 0) {
	console.error(`\n${errors} error(s) found.`);
	process.exit(1);
}
