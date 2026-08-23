#!/usr/bin/env node

/**
 * 检查 Tailwind CSS 任意值使用
 * - 禁止 arbitrary value（方括号在工具类值的位置），如 w-[96px]、h-[50%]、bg-[#fff]
 * - 允许 arbitrary variant（方括号在变体位置），如 [&_tr]:border-b、data-[state=open]:flex
 *
 * 算法：扫描全文取出字符串字面量（跳过注释与正则）→ 按空白切 token →
 * 以「最后一个不在方括号内的冒号」分出变体链与工具类部分，只查工具类部分。
 * 本仓库偏差说明: `packages/ui/src/components/` 下 vendored 的 shadcn 组件原件
 * 豁免本检查（原件大量使用任意值），完整理由见 scripts/vendored-ui.js。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { selectCheckableFiles, VENDORED_UI_HINT } from "./vendored-ui.js";

const CONTEXT_MAX_LENGTH = 60;
const CHECKED_EXTENSION = /\.(?:tsx?|jsx?)$/;
// 出现在 `/` 之前时表示除法而非正则字面量的字符
const DIVISION_PREFIX = /[\w$)\]"'`]/;
const WHITESPACE = /\s/;
const TOKEN_SEPARATOR = /\s+/;
// arbitrary value 的工具类前缀：为空（arbitrary property）或以 `-` / `/` 结尾
const UTILITY_PREFIX = /^(?:!?[a-z0-9@./-]*[-/])?$/;
// arbitrary value 之后允许的后缀：透明度（/50）与 important（!）
const ARBITRARY_SUFFIX = /^(?:\/[a-z0-9.%-]+)?!?$/;

function countNewlines(text) {
	return text.split("\n").length - 1;
}

function skipComment(content, start) {
	if (content[start + 1] === "/") {
		const end = content.indexOf("\n", start);
		return end === -1 ? content.length : end;
	}
	const end = content.indexOf("*/", start + 2);
	return end === -1 ? content.length : end + 2;
}

// 跳过正则字面量；判定不是正则（如跨行）时只前进一个字符
function skipRegex(content, start) {
	let inCharClass = false;
	for (let i = start + 1; i < content.length; i += 1) {
		const char = content[i];
		if (char === "\\") {
			i += 1;
		} else if (char === "\n") {
			return start + 1;
		} else if (char === "[") {
			inCharClass = true;
		} else if (char === "]") {
			inCharClass = false;
		} else if (char === "/" && !inCharClass) {
			return i + 1;
		}
	}
	return start + 1;
}

// 注释 / 正则字面量：返回跳过后的位置（无需跳过时返回 start）
function skipNonCode(content, start, prevChar) {
	if (content[start] !== "/") {
		return start;
	}
	const next = content[start + 1];
	if (next === "/" || next === "*") {
		return skipComment(content, start);
	}
	if (prevChar === "" || !DIVISION_PREFIX.test(prevChar)) {
		return skipRegex(content, start);
	}
	return start;
}

// 跳过模板字面量中的 ${...} 插值（start 指向 `$`）
function skipInterpolation(content, start) {
	let depth = 0;
	for (let i = start + 1; i < content.length; i += 1) {
		const char = content[i];
		if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return i + 1;
			}
		}
	}
	return content.length;
}

/**
 * 读取一个字符串字面量，返回按行/插值切开的片段（每段带准确行号）。
 * 单双引号字符串在 JS 中不能跨行，遇到换行即判定为误判并回退，
 * 这样 JSX 文本里的撇号（It's）不会破坏后续扫描。
 */
function readLiteral(content, start, line) {
	const quote = content[start];
	const isTemplate = quote === "`";
	const chunks = [];
	const abort = { chunks: [], end: start + 1 };
	let text = "";
	let currentLine = line;
	let i = start + 1;
	const flush = () => {
		if (text.trim() !== "") {
			chunks.push({ line: currentLine, text });
		}
		text = "";
	};
	while (i < content.length) {
		const char = content[i];
		if (char === "\\") {
			text += content[i + 1] ?? "";
			i += 2;
		} else if (char === quote) {
			flush();
			return { chunks, end: i + 1 };
		} else if (char === "\n") {
			if (!isTemplate) {
				return abort;
			}
			flush();
			currentLine += 1;
			i += 1;
		} else if (isTemplate && char === "$" && content[i + 1] === "{") {
			flush();
			const end = skipInterpolation(content, i);
			currentLine += countNewlines(content.slice(i, end));
			i = end;
		} else {
			text += char;
			i += 1;
		}
	}
	return abort;
}

const QUOTES = new Set(['"', "'", "`"]);

// 提取所有字符串字面量片段：[{ line, text }]
export function extractStringLiterals(content) {
	const chunks = [];
	let i = 0;
	let line = 1;
	let prevChar = "";
	while (i < content.length) {
		const char = content[i];
		if (char === "\n") {
			line += 1;
			i += 1;
			continue;
		}
		const skipped = skipNonCode(content, i, prevChar);
		if (skipped > i) {
			line += countNewlines(content.slice(i, skipped));
			i = skipped;
			prevChar = "/";
			continue;
		}
		if (QUOTES.has(char)) {
			const literal = readLiteral(content, i, line);
			chunks.push(...literal.chunks);
			line += countNewlines(content.slice(i, literal.end));
			i = literal.end;
			prevChar = char;
			continue;
		}
		if (!WHITESPACE.test(char)) {
			prevChar = char;
		}
		i += 1;
	}
	return chunks;
}

// 取 token 中「最后一个顶层冒号」之后的工具类部分（变体链里的方括号合法）
export function getUtilityPart(token) {
	let depth = 0;
	let lastColon = -1;
	for (let i = 0; i < token.length; i += 1) {
		const char = token[i];
		if (char === "[") {
			depth += 1;
		} else if (char === "]") {
			depth = depth > 0 ? depth - 1 : 0;
		} else if (char === ":" && depth === 0) {
			lastColon = i;
		}
	}
	return token.slice(lastColon + 1);
}

/**
 * 工具类部分是否为 Tailwind arbitrary value。形态约束用于排除
 * JS 下标 `idMap[id]`、SQL `::text[]`、文案 `errors[]`、选择器 `[data-x]`：
 * 方括号成对且非空；前缀只含工具类名字符且以 `-` 或 `/` 结尾；
 * 前缀为空时属 arbitrary property，必须形如 `[属性:值]`；括号后只允许 `/50`、`!`。
 */
function isArbitraryUtility(utility) {
	const open = utility.indexOf("[");
	const close = utility.lastIndexOf("]");
	if (open === -1 || close < open) {
		return false;
	}
	const prefix = utility.slice(0, open);
	const content = utility.slice(open + 1, close);
	if (!UTILITY_PREFIX.test(prefix) || content === "") {
		return false;
	}
	if (prefix === "" && !content.includes(":")) {
		return false;
	}
	return ARBITRARY_SUFFIX.test(utility.slice(close + 1));
}

export function isArbitraryValueToken(token) {
	return token.includes("[") && isArbitraryUtility(getUtilityPart(token));
}

// 检查源码文本，返回违规列表
export function checkContent(content) {
	const lines = content.split("\n");
	const issues = [];
	for (const chunk of extractStringLiterals(content)) {
		for (const token of chunk.text.split(TOKEN_SEPARATOR)) {
			if (!isArbitraryValueToken(token)) {
				continue;
			}
			const source = lines[chunk.line - 1] ?? "";
			issues.push({
				context: source.trim().slice(0, CONTEXT_MAX_LENGTH),
				line: chunk.line,
				value: token,
			});
		}
	}
	return issues;
}

export function checkFile(filePath) {
	try {
		return checkContent(readFileSync(filePath, "utf-8"));
	} catch {
		return [];
	}
}

function printIssues(file, issues) {
	console.error(`\n❌ ${file}`);
	console.error(`   发现 ${issues.length} 处 Tailwind 任意值使用:\n`);
	for (const issue of issues) {
		console.error(`   第 ${issue.line} 行: ${issue.value}`);
		console.error(`   上下文: ${issue.context}...`);
	}
}

function printHelp() {
	// 本仓库是 Tailwind v4 CSS-first，没有 tailwind.config.js —— 自定义值的落点是
	// globals.css / index.css 里的 @utility 块，别照 v3 的老文档去建 config 文件。
	console.error(`
❌ Tailwind CSS 检查失败

请使用标准类名: w-[96px]→w-24、h-[50%]→h-1/2、bg-[#fff]→bg-white
变体写法不受限制: [&_tr]:border-b、data-[state=open]:flex
必须用自定义值时，在 globals.css / index.css 里加 @utility 并注明等价写法。
${VENDORED_UI_HINT}
`);
}

function main() {
	const files = process.argv.slice(2);
	if (files.length === 0) {
		console.log("没有文件需要检查");
		process.exit(0);
	}
	let hasErrors = false;
	for (const file of selectCheckableFiles(files, CHECKED_EXTENSION)) {
		const issues = checkFile(file);
		if (issues.length > 0) {
			printIssues(file, issues);
			hasErrors = true;
		}
	}
	if (hasErrors) {
		printHelp();
		process.exit(1);
	}
	console.log("✅ Tailwind CSS 检查通过");
	process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
