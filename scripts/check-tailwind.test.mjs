import assert from "node:assert/strict";
import { test } from "node:test";
import { checkContent } from "./check-tailwind.js";

const values = (content) => checkContent(content).map((issue) => issue.value);

const LEGAL_TOKENS = [
	"[&_tr]:border-b",
	"[&_tr:last-child]:border-0",
	"group-data-[size=sm]/name:flex",
	"has-data-[slot=kbd]:pr-1",
	"data-[state=open]:rotate-180",
	"md:hover:bg-muted",
	"supports-[display:grid]:grid",
];

const ILLEGAL_TOKENS = [
	"w-[96px]",
	"bg-[#fff]",
	"h-[50%]",
	"p-[1.5rem]",
	"[color:red]",
	"grid-rows-[auto_1fr]",
];

test("arbitrary variant 不报错", () => {
	for (const token of LEGAL_TOKENS) {
		assert.deepEqual(values(`const a = "${token}";`), [], token);
	}
});

test("arbitrary value 必须报错", () => {
	for (const token of ILLEGAL_TOKENS) {
		assert.deepEqual(values(`const a = "${token}";`), [token], token);
	}
});

test("变体合法但工具类违规时只报工具类 token", () => {
	assert.deepEqual(values('const a = "data-[state=open]:w-[96px]";'), [
		"data-[state=open]:w-[96px]",
	]);
	assert.deepEqual(
		values('const a = "[&_tr]:border-b hover:bg-muted h-[18px]";'),
		["h-[18px]"]
	);
});

test("注释中的示例不报错", () => {
	assert.deepEqual(values('// 例如 w-[96px] 是错的\nconst a = "w-4";'), []);
	assert.deepEqual(
		values('/* w-[96px]\n   bg-[#fff] */\nconst a = "w-4";'),
		[]
	);
	assert.deepEqual(values('const a = "w-4"; // h-[50%]'), []);
});

test("多行 cva 中的任意值可以检出（缺陷 B 回归）", () => {
	const source = [
		'const badge = cva("base", {',
		"\tvariants: {",
		'\t\tsize: { sm: "h-[18px] px-1" },',
		"\t},",
		"});",
	].join("\n");
	const issues = checkContent(source);
	assert.deepEqual(
		issues.map((i) => [i.line, i.value]),
		[[3, "h-[18px]"]]
	);
});

test("多行模板字面量中的任意值可以检出且行号准确", () => {
	const source = [
		"const cls = `",
		"  flex items-center",
		"  w-[96px]",
		"`;",
	].join("\n");
	const issues = checkContent(source);
	assert.deepEqual(
		issues.map((i) => [i.line, i.value]),
		[[3, "w-[96px]"]]
	);
});

// 用变量拼出 `$` + `{`，避免源码里出现字符串内的模板占位符
const D = "$";

test("模板插值不被当作类名扫描", () => {
	const source = `const cls = \`flex ${D}{map[\`w-[96px]\`.length]} p-2\`;`;
	assert.deepEqual(values(source), []);
});

test("以插值开头的模板不会吞掉后续源码", () => {
	const source = [
		`const errorId = \`${D}{id}-error\`;`,
		"const arr: Foo[] = [];",
		'const cls = "w-[96px]";',
	].join("\n");
	const issues = checkContent(source);
	assert.deepEqual(
		issues.map((i) => [i.line, i.value]),
		[[3, "w-[96px]"]]
	);
});

test("上下文与行号取自真实源码行", () => {
	const source = ['const a = "w-4";', 'const b = cn("bg-[#fff]");'].join("\n");
	const [issue] = checkContent(source);
	assert.equal(issue.line, 2);
	assert.equal(issue.value, "bg-[#fff]");
	assert.equal(issue.context, 'const b = cn("bg-[#fff]");');
});

test("JSX 中的 className 被检出，撇号不破坏扫描", () => {
	const source = [
		"export const A = () => (",
		'\t<p title="It\'s fine" className="w-[96px]">hi</p>',
		");",
	].join("\n");
	assert.deepEqual(values(source), ["w-[96px]"]);
});

test("正则字面量不会破坏扫描", () => {
	const source = ["const re = /[\"']/g;", 'const a = "w-[96px]";'].join("\n");
	assert.deepEqual(values(source), ["w-[96px]"]);
});

test("非类名字符串中的方括号不报错", () => {
	const notClassNames = [
		'const root = el.closest("[data-cursor-root]");',
		'const desc = "steps [{id, step, expected}], tags";',
		'const desc = "Result: {created[] (action), skipped[], errors[]}";',
		`const q = sql\`${D}{t.tags} ?| ${D}{sql.param(tags)}::text[]\`;`,
		'const hint = \'e.g. ["Orders", "Payment"]\';',
		'console.error(\'  "w-[96px]"    →  "w-24"\');',
	];
	for (const source of notClassNames) {
		assert.deepEqual(values(source), [], source);
	}
});

test("带前缀与后缀的真实任意值仍然报错", () => {
	const tokens = [
		"!w-[96px]",
		"-mt-[2px]",
		"bg-red-500/[0.5]",
		"bg-[#fff]/50",
		"w-[calc(100%-1rem)]",
		"shadow-[0_0_0_1px_rgba(0,0,0,0.1)]",
		"text-[--brand]",
	];
	for (const token of tokens) {
		assert.deepEqual(values(`const a = "${token}";`), [token], token);
	}
});

test("空内容与无类名文件不报错", () => {
	assert.deepEqual(values(""), []);
	assert.deepEqual(values('const url = "https://example.com/a";'), []);
});
