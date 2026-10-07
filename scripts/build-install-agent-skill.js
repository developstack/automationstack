#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_ROOT = join(REPO_ROOT, ".claude/skills");
const TARGET = join(REPO_ROOT, "apps/web/public/install-agent-skill.sh");

const SKILLS = ["testcase-authoring", "testcase-migration"];

const DEFAULT_MCP_URL = "http://localhost:3000/mcp";
const URL_PLACEHOLDER = "__MCP_URL__";

const BEGIN_MARKER = "# >>> BEGIN GENERATED SKILLS";
const END_MARKER = "# <<< END GENERATED SKILLS";

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
