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
