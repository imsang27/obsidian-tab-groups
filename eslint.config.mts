// TypeScript 6 no longer loads @types/node by default, and this file uses import.meta.dirname.
/// <reference types="node" />
import stylistic from '@stylistic/eslint-plugin';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'vitest.config.mts',
		'wdio.conf.mts',
		'wdio.demo.mts',
		'tests/e2e/plugins',
		'version-bump.mjs',
		'scripts',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	// A comma after the last item of a multi-line list, so adding an item changes only one line in the diff.
	// (JSON doesn't allow it, so this is for code only.)
	{
		files: ['**/*.{ts,mts,js,mjs}'],
		plugins: {
			'@stylistic': stylistic,
		},
		rules: {
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
		},
	},
	// E2E tests run under Mocha (describe, it, beforeEach)
	{
		files: ['tests/e2e/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.mocha,
			},
		},
	},
);
