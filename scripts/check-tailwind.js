#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { selectCheckableFiles, VENDORED_UI_HINT } from "./vendored-ui.js";

const CONTEXT_MAX_LENGTH = 60;
const CHECKED_EXTENSION = /\.(?:tsx?|jsx?)$/;
const DIVISION_PREFIX = /[\w$)\]"'`]/;
const WHITESPACE = /\s/;
const TOKEN_SEPARATOR = /\s+/;
const UTILITY_PREFIX = /^(?:!?[a-z0-9@./-]*[-/])?$/;
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
