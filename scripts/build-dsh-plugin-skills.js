#!/usr/bin/env node

/*
 * 把 .claude/skills/ 下的两个 skill 复制进 dsh 插件的 skills/（入版本库的副本）。
 *
 *   node scripts/build-dsh-plugin-skills.js          重新生成
 *   node scripts/build-dsh-plugin-skills.js --check  只比对，不一致时 exit 1
 *
 * 与 build-install-agent-skill.js 一样：skill 源由 dev-cli 同步、已 gitignore，
 * CI / 全新 clone 里没有它们。--check 找不到源时打印提示并 exit 0。
 *
 * 唯一的改写：skill 正文里的本地开发地址 http://localhost:3000/mcp 换成插件的默认
 * 端点。安装脚本用占位符，是因为它在安装时按 --url 再替换一次；dsh 直接从磁盘读
 * skill 文件，没有替换这一步，占位符会原样进入模型上下文。
 *
 * --source / --target 只给单测用：指向临时目录，不碰仓库里的文件。
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
	DEFAULT_URL,
	SKILL_NAMES,
} from "../plugins/dsh-testcase-platform/config.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = join(REPO_ROOT, ".claude/skills");
const DEFAULT_TARGET = join(REPO_ROOT, "plugins/dsh-testcase-platform/skills");
const SOURCE_MCP_URL = "http://localhost:3000/mcp";

function parseArgs(argv) {
	const options = {
		check: argv.includes("--check"),
		source: DEFAULT_SOURCE,
		target: DEFAULT_TARGET,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--source" || argument === "--target") {
			const value = argv[index + 1];
			if (value === undefined) {
				throw new Error(`${argument} 缺少目录参数`);
			}
			options[argument.slice(2)] = resolve(value);
			index += 1;
		} else if (argument !== "--check") {
			throw new Error(`未知参数：${argument}`);
		}
	}
	return options;
}

function toPosix(path) {
	return path.split(sep).join("/");
}

/** 与安装脚本同一个范围：SKILL.md 加 references/ 下的 .md。 */
function sourceFiles(sourceRoot, skill) {
	let references = [];
	try {
		references = readdirSync(join(sourceRoot, skill, "references"))
			.filter((name) => name.endsWith(".md"))
			.sort();
	} catch {
		references = [];
	}
	return ["SKILL.md", ...references.map((name) => `references/${name}`)];
}

function expectedTree(sourceRoot) {
	const tree = new Map();
	for (const skill of SKILL_NAMES) {
		for (const file of sourceFiles(sourceRoot, skill)) {
			const text = readFileSync(join(sourceRoot, skill, file), "utf-8");
			tree.set(
				`${skill}/${file}`,
				text.replaceAll(SOURCE_MCP_URL, DEFAULT_URL)
			);
		}
	}
	return tree;
}

/** 目标目录里的全部文件，多出来的文件也算漂移。 */
function actualTree(targetRoot) {
	const tree = new Map();
	if (!existsSync(targetRoot)) {
		return tree;
	}
	const entries = readdirSync(targetRoot, {
		recursive: true,
		withFileTypes: true,
	});
	for (const entry of entries) {
		if (entry.isFile()) {
			const absolute = join(entry.parentPath, entry.name);
			tree.set(
				toPosix(relative(targetRoot, absolute)),
				readFileSync(absolute, "utf-8")
			);
		}
	}
	return tree;
}

function diffTrees(expected, actual) {
	const drift = [];
	for (const [path, content] of expected) {
		if (!actual.has(path)) {
			drift.push(`缺少 ${path}`);
		} else if (actual.get(path) !== content) {
			drift.push(`内容不同 ${path}`);
		}
	}
	for (const path of actual.keys()) {
		if (!expected.has(path)) {
			drift.push(`多余 ${path}`);
		}
	}
	return drift.sort();
}

function writeTree(targetRoot, tree) {
	rmSync(targetRoot, { force: true, recursive: true });
	for (const [path, content] of tree) {
		const absolute = join(targetRoot, path);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const missing = SKILL_NAMES.filter(
		(skill) => !existsSync(join(options.source, skill, "SKILL.md"))
	);
	if (missing.length > 0) {
		if (options.check) {
			console.log(
				`⚠️ 跳过漂移检查：找不到 skill 源（${missing.join("、")}），.claude/skills/ 由 dev-cli 同步、不在版本库内。本地同步 skill 后再跑即可校验。`
			);
			return;
		}
		throw new Error(
			`找不到 skill 源：${missing.join("、")}（先用 dev-cli 同步 .claude/skills/）`
		);
	}

	const expected = expectedTree(options.source);
	const drift = diffTrees(expected, actualTree(options.target));
	if (drift.length === 0) {
		console.log("✅ dsh 插件的 skills/ 与 .claude/skills/ 一致");
		return;
	}
	if (options.check) {
		console.error("\n❌ dsh 插件的 skills/ 与 .claude/skills/ 不一致：");
		for (const line of drift) {
			console.error(`   ${line}`);
		}
		console.error("   跑一次 node scripts/build-dsh-plugin-skills.js 重新生成");
		process.exit(1);
	}
	writeTree(options.target, expected);
	console.log(`✅ 已更新 dsh 插件的 skills/（${drift.length} 处变化）`);
}

main();
