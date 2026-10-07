#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { checkDependencyVersions } from "./package-version-rules.js";

function reportIssues(filePath, issues) {
	const lines = [
		`\n❌ ${filePath}`,
		`   发现 ${issues.length} 个依赖版本不符合规范:\n`,
		...issues.map(
			(issue) =>
				`   - ${issue.section}.${issue.dependency}: "${issue.version}" (${issue.reason})`
		),
		"\n   只允许这四种写法:",
		"     1.2.3                             精确版本（可带 -beta.1 / +build）",
		"     workspace:* 或 workspace:1.2.3   工作区协议（不接受 ^ / ~）",
		"     catalog: / catalog:名字            目录协议",
		"     npm:pkg@1.2.3                     别名，版本段同样要精确\n",
	];
	console.error(lines.join("\n"));
}

function inspectPackageJson(filePath, counter) {
	let pkg;
	try {
		pkg = JSON.parse(readFileSync(filePath, "utf-8"));
	} catch (error) {
		console.error(`\n⚠️  读不到或解析不了 ${filePath}: ${error.message}`);
		return "error";
	}

	const issues = checkDependencyVersions(pkg, [], counter);
	if (issues.length > 0) {
		reportIssues(filePath, issues);
		return "violation";
	}
	return "ok";
}

function reportFailure(violations, errors) {
	const lines = [];
	if (errors.length > 0) {
		lines.push(
			`\n❌ package.json 检查未能完成（${errors.length} 个文件）`,
			"   这不是版本写法违规，是这道检查本身没跑成：",
			...errors.map((file) => `   - ${file}`),
			"   请确认路径存在且 JSON 可解析，然后重跑。"
		);
	}
	if (violations.length > 0) {
		lines.push(
			`\n❌ package.json 检查失败（${violations.length} 个文件）`,
			"\n请将依赖版本改为固定版本号:",
			'  "^1.2.3"  →  "1.2.3"',
			'  "latest"   →  "2.1.9"\n'
		);
	}
	console.error(lines.join("\n"));
}

function main() {
	const files = process.argv.slice(2);

	if (files.length === 0) {
		console.error(
			"\n❌ check-package-json: 没有传入任何文件\n   用法: node scripts/check-package-json.js <package.json> [更多文件...]\n"
		);
		process.exit(1);
	}

	const targets = files.filter((file) => file.endsWith("package.json"));
	if (targets.length === 0) {
		console.error(
			`\n❌ check-package-json: 传入 ${files.length} 个路径，没有一个是 package.json\n   一个文件都没检查，不能算通过。\n`
		);
		process.exit(1);
	}

	const violations = [];
	const errors = [];
	const counter = { checked: 0 };
	for (const file of targets) {
		const status = inspectPackageJson(file, counter);
		if (status === "violation") {
			violations.push(file);
		} else if (status === "error") {
			errors.push(file);
		}
	}

	if (violations.length > 0 || errors.length > 0) {
		reportFailure(violations, errors);
		process.exit(1);
	}

	console.log(
		`✅ package.json 检查通过（${targets.length} 个文件，${counter.checked} 处依赖）`
	);
	process.exit(0);
}

main();
