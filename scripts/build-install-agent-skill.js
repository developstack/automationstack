#!/usr/bin/env node

/**
 * 把 `.claude/skills/` 下的两个 skill 嵌进 `apps/web/public/install-agent-skill.sh`。
 *
 * 为什么需要这个脚本
 * ------------------
 * 安装脚本是发给用户的**单文件**离线安装器，skill 正文必须躺在它自己肚子里。
 * 早先那份正文是手抄进去的，于是仓库里的 skill 改了、脚本里的没改，用户装到的
 * 是另一套东西（连 skill 名都对不上：脚本装的叫 testcase-platform，仓库里根本
 * 没有这个 skill）。手抄 + 靠人记得同步 = 一定漂移，所以改成生成 + 门禁校验。
 *
 * 没选「安装时从 web 下载」：安装脚本的 --url 指向 MCP 端点（server），skill
 * 文件是 web 的静态资源（另一个端口），从前者推后者是猜；而且那会给一个现在
 * 完全离线可用的安装器加上「下载失败」「下到旧版本」两种新失败形态。
 *
 * 用法：
 *   node scripts/build-install-agent-skill.js           # 重新生成
 *   node scripts/build-install-agent-skill.js --check   # 只校验，不写（CI 用）
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_ROOT = join(REPO_ROOT, ".claude/skills");
const TARGET = join(REPO_ROOT, "apps/web/public/install-agent-skill.sh");

// 装哪些 skill：显式列出，不扫目录。`.claude/skills/` 以后可能放只给本仓库
// 开发者用的 skill，那些不该被发给平台用户。
const SKILLS = ["testcase-authoring", "testcase-migration"];

// 安装脚本把 skill 正文里的这个占位符 sed 成用户的 --url。
// 仓库里的 skill 真身写的是真实默认地址（那是给读文档的人看的），
// 占位符只在嵌入时替换，不污染真身。
const DEFAULT_MCP_URL = "http://localhost:3000/mcp";
const URL_PLACEHOLDER = "__MCP_URL__";

const BEGIN_MARKER = "# >>> BEGIN GENERATED SKILLS";
const END_MARKER = "# <<< END GENERATED SKILLS";

/** SKILL.md 永远排第一，references 按文件名排序，保证生成结果可复现。 */
function skillFiles(skill) {
	const referencesDir = join(SKILLS_ROOT, skill, "references");
	let references = [];
	try {
		references = readdirSync(referencesDir)
			.filter((name) => name.endsWith(".md"))
			.sort();
	} catch {
		references = [];
	}
	return ["SKILL.md", ...references.map((name) => `references/${name}`)];
}

function readSkillFile(skill, relativePath) {
	const raw = readFileSync(join(SKILLS_ROOT, skill, relativePath), "utf-8");
	const text = raw.endsWith("\n") ? raw : `${raw}\n`;
	return text.replaceAll(DEFAULT_MCP_URL, URL_PLACEHOLDER);
}

/**
 * 引号定界符的 heredoc：正文原样保留，$AS_TOKEN / ${...} 不会被 shell 展开。
 * 定界符带序号，并断言正文里没有同名行——否则 heredoc 会提前结束，
 * 后半段正文就变成 shell 命令被执行。
 */
function heredoc(index, content) {
	const delimiter = `TCP_SKILL_EOF_${index}`;
	if (content.split("\n").includes(delimiter)) {
		throw new Error(`heredoc 定界符 ${delimiter} 与正文冲突`);
	}
	return `\t\tcat <<'${delimiter}'\n${content}${delimiter}\n\t\t\t;;\n`;
}

function renderFileList() {
	const branches = SKILLS.map((skill) => {
		const quoted = skillFiles(skill)
			.map((name) => `'${name}'`)
			.join(" ");
		return `\t\t'${skill}')\n\t\t\tprintf '%s\\n' ${quoted}\n\t\t\t;;\n`;
	}).join("");
	return [
		"# skill_file_list <skill 名>：这个 skill 由哪些文件组成（相对 skill 目录）。",
		"skill_file_list() {",
		'\tcase "$1" in',
		branches.trimEnd(),
		"\tesac",
		"}",
		"",
	].join("\n");
}

function renderFileContent() {
	let index = 0;
	let branches = "";
	for (const skill of SKILLS) {
		for (const relativePath of skillFiles(skill)) {
			index += 1;
			branches += `\t\t'${skill}/${relativePath}')\n`;
			branches += heredoc(index, readSkillFile(skill, relativePath));
		}
	}
	return [
		"# skill_file_content <skill 名> <相对路径>：把该文件的正文吐到 stdout。",
		"skill_file_content() {",
		'\tcase "$1/$2" in',
		branches.trimEnd(),
		"\tesac",
		"}",
	].join("\n");
}

function renderBlock() {
	return [
		BEGIN_MARKER,
		`SKILL_NAMES="${SKILLS.join(" ")}"`,
		"",
		renderFileList(),
		renderFileContent(),
		END_MARKER,
	].join("\n");
}

function spliceBlock(script, block) {
	const begin = script.indexOf(BEGIN_MARKER);
	const end = script.indexOf(END_MARKER);
	if (begin === -1 || end === -1 || end < begin) {
		throw new Error(
			`${TARGET} 里找不到成对的 GENERATED 标记，无法安全写入（标记被删了？）`
		);
	}
	return script.slice(0, begin) + block + script.slice(end + END_MARKER.length);
}

function main() {
	const check = process.argv.includes("--check");
	const current = readFileSync(TARGET, "utf-8");
	const next = spliceBlock(current, renderBlock());

	if (current === next) {
		console.log("✅ install-agent-skill.sh 与 .claude/skills/ 一致");
		return;
	}
	if (check) {
		console.error("\n❌ install-agent-skill.sh 内嵌的 skill 正文与仓库不一致");
		console.error(
			"   跑一次 node scripts/build-install-agent-skill.js 重新生成"
		);
		process.exit(1);
	}
	writeFileSync(TARGET, next);
	console.log("✅ 已更新 install-agent-skill.sh 内嵌的 skill 正文");
}

main();
