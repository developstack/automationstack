/** @type {import('eslint').Linter.Config} */
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
			// 禁止 any
			"@typescript-eslint/no-explicit-any": "error",
			// 禁止非空断言
			"@typescript-eslint/no-non-null-assertion": "error",

			// 强制使用 readonly (警告级别)
			"@typescript-eslint/prefer-readonly": "warn",

			// 圈复杂度
			complexity: ["error", 10],

			// 必须返回值
			"consistent-return": "error",

			// 嵌套层数限制
			"max-depth": ["warn", 4],

			// 函数行数限制
			"max-lines-per-function": [
				"error",
				{
					max: 50,
					skipBlankLines: true,
					skipComments: true,
				},
			],

			// 参数个数限制
			"max-params": ["warn", 4],

			// 禁止 console.log
			"no-console": "warn",

			// 魔术数字
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
		// 「一个文件一个组件」（方案 C）：一个文件只允许 1 个**对外组件**
		// （被 export 的组件），外加至多 2 个**私有辅助组件**（同文件里未导出
		// 的组件）；文件名须等于唯一对外组件名的 kebab-case。
		//
		// 规则实现与「什么算 React 组件」的 AST 判定见
		// eslint-rules/one-component-per-file.js；口径的完整取舍论证
		// （为什么是「私有 ≤2」而不是严格「1 个组件 1 个文件」、为什么不用
		// eslint-plugin-react 的 react/no-multi-comp）见
		// docs/init-code-quantity.md §4.3。
		//
		// 豁免（packages/ui/src/components/ 的 vendored 区、测试文件、生成物）
		// 写在规则实现里，与 scripts/check-file-rules.js、scripts/check-tailwind.js
		// 把豁免写进脚本本体的做法一致，这样豁免本身也能被单元测试覆盖。
		//
		// ⚠️ 现在是 warn，不是 error：接上时全仓存量违规还没拆完，
		// 直接上 error 会当场卡死所有人的 pre-commit 与 CI 的 eslint 步骤。
		// **等批量拆分完成、这条规则的 warning 清零后，这里改成 "error"。**
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
		// vendored 的 shadcn 组件原件：上游多个组件的单个函数就超过 50 行、
		// 圈复杂度也超标（chart.tsx 的 ChartTooltipContent 是 143 行）。
		// 拆开会让本地文件与 registry 永久对不上——这与 scripts/vendored-ui.js
		// 和 scripts/check-file-rules.js 里已有的豁免是同一条理由，
		// 这里补齐 eslint 侧漏掉的那一半。命名与 no-explicit-any 等规则仍然适用。
		files: ["packages/ui/src/components/**/*.{ts,tsx}"],
		rules: {
			complexity: "off",
			"consistent-return": "off",
			"max-lines-per-function": "off",
		},
	},
	{
		// 测试文件：一个 it()/describe() 回调天然会长，按行数拆测试只会让
		// 断言离被测对象更远。复杂度与行数限制针对的是生产代码。
		files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
		rules: {
			"max-lines-per-function": "off",
			"no-magic-numbers": "off",
		},
	},
];
