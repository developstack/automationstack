export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.next/**",
			"**/.turbo/**",
			"**/*.config.{js,ts,mjs}",
			"**/routeTree.gen.ts",
			"**/.output/**",
			"**/.nitro/**",
			"**/.tanstack/**",
			"**/migrations/**",
		],
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: await import("@typescript-eslint/parser"),
			parserOptions: {
				ecmaVersion: "latest",
				projectService: true,
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": (await import("@typescript-eslint/eslint-plugin"))
				.default,
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "error",

			"@typescript-eslint/prefer-readonly": "warn",

			complexity: ["error", 10],

			"consistent-return": "error",

			"max-depth": ["warn", 4],

			"max-lines-per-function": [
				"error",
				{
					max: 50,
					skipBlankLines: true,
					skipComments: true,
				},
			],

			"max-params": ["warn", 4],

			"no-console": "warn",

			"no-magic-numbers": [
				"warn",
				{
					ignore: [-1, 0, 1],
					ignoreArrayIndexes: true,
					ignoreDefaultValues: true,
					ignoreEnums: true,
				},
			],
		},
	},
	{
		// eslint-rules/one-component-per-file.js；口径的完整取舍论证
		// eslint-plugin-react 的 react/no-multi-comp）见
		files: ["**/*.tsx"],
		plugins: {
			local: {
				rules: {
					"one-component-per-file": (
						await import("./eslint-rules/one-component-per-file.js")
					).oneComponentPerFile,
				},
			},
		},
		rules: {
			"local/one-component-per-file": "warn",
		},
	},
	{
		files: ["packages/ui/src/components/**/*.{ts,tsx}"],
		rules: {
			complexity: "off",
			"consistent-return": "off",
			"max-lines-per-function": "off",
		},
	},
	{
		files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
		rules: {
			"max-lines-per-function": "off",
			"no-magic-numbers": "off",
		},
	},
];
