import { describe, it } from "node:test";
import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { oneComponentPerFile } from "./one-component-per-file.js";

RuleTester.describe = describe;
RuleTester.it = it;

const WEB = "/repo/apps/web/src/components";
const VENDORED = "/repo/packages/ui/src/components";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: {
			ecmaFeatures: { jsx: true },
			ecmaVersion: "latest",
			sourceType: "module",
		},
	},
});

const helper = (name) => `function ${name}() {\n\treturn <span />;\n}`;

ruleTester.run("one-component-per-file", oneComponentPerFile, {
	invalid: [
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				helper("Row"),
				helper("Cell"),
				helper("Head"),
			].join("\n"),
			errors: [{ messageId: "tooManyPrivateHelpers" }],
			filename: `${WEB}/case-table.tsx`,
			name: "1 导出 + 3 私有 → 报错",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				"export function CaseRow() {\n\treturn <tr />;\n}",
			].join("\n"),
			errors: [{ messageId: "tooManyExports" }],
			filename: `${WEB}/case-table.tsx`,
			name: "2 个导出组件 → 报错",
		},
		{
			code: "export function CaseTable() {\n\treturn <div />;\n}",
			errors: [{ messageId: "filenameMismatch" }],
			filename: `${WEB}/table-of-cases.tsx`,
			name: "文件名与唯一导出组件不匹配 → 报错",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				helper("Row"),
				helper("Cell"),
				"const Head = memo(() => <th />);",
			].join("\n"),
			errors: [{ messageId: "tooManyPrivateHelpers" }],
			filename: `${WEB}/case-table.tsx`,
			name: "memo() 包装的私有组件也计入数量",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				helper("Row"),
				helper("Cell"),
				"const Head = forwardRef((props, ref) => {\n\treturn <th ref={ref} />;\n});",
			].join("\n"),
			errors: [{ messageId: "tooManyPrivateHelpers" }],
			filename: `${WEB}/case-table.tsx`,
			name: "forwardRef() 包装的私有组件也计入数量",
		},
		{
			code: [
				"function CaseTable() {\n\treturn <div />;\n}",
				"function CaseRow() {\n\treturn <tr />;\n}",
				"export { CaseRow, CaseTable };",
			].join("\n"),
			errors: [{ messageId: "tooManyExports" }],
			filename: `${WEB}/case-table.tsx`,
			name: "export { A, B } 的导出形式也被算作对外组件",
		},
		{
			code: [
				"export const CaseTable = () => <div />;",
				"const Row = () => (cond ? <tr /> : null);",
				"const Cell = () => <td />;",
				"const Head = () => <th />;",
			].join("\n"),
			errors: [{ messageId: "tooManyPrivateHelpers" }],
			filename: `${WEB}/case-table.tsx`,
			name: "返回 null 分支的箭头组件也被识别",
		},
	],
	valid: [
		{
			code: "export function CaseTable() {\n\treturn <div />;\n}",
			filename: `${WEB}/case-table.tsx`,
			name: "单个导出组件 + 文件名匹配",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				helper("Row"),
				helper("Cell"),
			].join("\n"),
			filename: `${WEB}/case-table.tsx`,
			name: "1 导出 + 2 私有辅助",
		},
		{
			code: "export const AIPanel = memo(() => <div />);",
			filename: `${WEB}/ai-panel.tsx`,
			name: "memo() 包装的导出组件被识别，缩写按 ai-panel 转写",
		},
		{
			code: [
				"export const CaseInput = forwardRef((props, ref) => {",
				"\treturn <input ref={ref} />;",
				"});",
			].join("\n"),
			filename: `${WEB}/case-input.tsx`,
			name: "forwardRef() 包装的导出组件被识别",
		},
		{
			code: [
				'const EMAIL_ID = "email";',
				'const STATUS_FILTER_OPTIONS = ["a", "b"];',
				"const MAX_ROWS = 10;",
				"export function CaseTable() {\n\treturn <div />;\n}",
			].join("\n"),
			filename: `${WEB}/case-table.tsx`,
			name: "ALL_CAPS 常量不被误判为组件",
		},
		{
			code: [
				"export const CaseTable = () => <div />;",
				"const buildRows = () => [1, 2, 3];",
				'const CaseColumns = () => ({ id: "id" });',
				"const useCaseTable = () => ({ rows: [] });",
			].join("\n"),
			filename: `${WEB}/case-table.tsx`,
			name: "不返回 JSX 的 PascalCase 函数不被误判为组件",
		},
		{
			code: [
				"export function Table() {\n\treturn <table />;\n}",
				"export function TableHeader() {\n\treturn <thead />;\n}",
				"export function TableBody() {\n\treturn <tbody />;\n}",
				"export function TableRow() {\n\treturn <tr />;\n}",
			].join("\n"),
			filename: `${VENDORED}/table.tsx`,
			name: "packages/ui/src/components/ 是 vendored 豁免区",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				"export function CaseRow() {\n\treturn <tr />;\n}",
				helper("A"),
				helper("B"),
				helper("C"),
			].join("\n"),
			filename: `${WEB}/case-table.test.tsx`,
			name: "测试文件豁免",
		},
		{
			code: [
				'export const Route = createFileRoute("/cases")({',
				"\tcomponent: RouteComponent,",
				"});",
				"function RouteComponent() {\n\treturn <div />;\n}",
			].join("\n"),
			filename: "/repo/apps/web/src/routes/cases.index.tsx",
			name: "路由文件：createFileRoute 不是组件，命名检查跳过 /routes/",
		},
		{
			code: [
				"export function CaseTable() {\n\treturn <div />;\n}",
				"function Row() {",
				"\tfunction Inner() {\n\t\treturn <i />;\n\t}",
				"\treturn <Inner />;",
				"}",
				helper("Cell"),
			].join("\n"),
			filename: `${WEB}/case-table.tsx`,
			name: "嵌套在组件内部的组件不计入文件级数量",
		},
		{
			code: "export const CaseTable = () => <div />;",
			filename: "/repo/apps/web/src/components/case/index.tsx",
			name: "index.tsx 跳过命名检查",
		},
	],
});
