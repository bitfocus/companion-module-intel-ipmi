import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

export default [
	...baseConfig,
	// The generated config only marks root-level *.mjs as ESM; cover src/ too.
	{
		files: ['**/*.mjs'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
