#!/usr/bin/env node

/**
 * 检查 package.json 依赖版本规则
 * - 禁止使用 ^ 前缀（必须使用固定版本）
 * - 禁止使用 ~ 前缀
 * - 禁止使用 "latest"
 * - workspace 和 catalog 除外
 *
 * 由 lefthook 的 package-json-rules 调用，**只检查命令行传进来的文件**，
 * 不做全仓扫描。所以「这次跑了」不等于「全仓是干净的」，只等于
 * 「这批文件是干净的」——下面那条检查数就是为了让前半句可证。
 *
 * 三条自证约定（2026-08-27 加）。此前这道检查会在传空参、传非 package.json
 * 路径两种情形下打印「✅ package.json 检查通过」并 exit 0，而实际检查了
 * **0 个文件**——输出和「12 个文件全部通过」一字不差。所以现在：
 *   1. 没传文件 = 调用方出错，报错退出；不再打印「检查根目录 package.json」
 *      这句它其实并不会做的事（原来那行 console.log 的下一行就是 exit 0）
 *   2. 实际检查数为 0 一律不算通过——「没查到东西」不等于「查过了没问题」
 *   3. 通过时必须打出检查数，让「这次到底跑没跑」在输出里可证
 *
 * 另外把「没检查成」（文件读不到、JSON 坏了）与「检查不通过」（版本写法违规）
 * 分成了两个出口。混在一起时，一个 ENOENT 会长得和真违规一模一样：
 * 现在表现为吵闹的假红，而只要有人为了消噪加一句「文件不存在就跳过」，
 * 同一段代码立刻翻成假绿。
 */

import { readFileSync } from "node:fs";

/**
 * 哪些位置放的是「依赖名 → 版本」。
 *
 * 按**完整路径形状**匹配，而不是只看顶层键名：`pnpm.overrides` 埋在第二层，
 * 只看 path[0] 会漏掉它——而它强制覆盖整棵依赖树的解析结果，
 * 是全仓最该管版本写法的地方。按形状匹配同时挡住了误报：
 * `peerDependenciesMeta` 这类同前缀、但值不是版本号的字段不会命中。
 */
const DEPENDENCY_SECTIONS = [
	["dependencies"],
	["devDependencies"],
	["peerDependencies"],
	["optionalDependencies"],
	["resolutions"],
];

/**
 * overrides 家族的值允许再套一层（npm 的嵌套 overrides 写法），
 * 所以这两条用前缀匹配而不是等长匹配。
 */
const NESTABLE_DEPENDENCY_SECTIONS = [["overrides"], ["pnpm", "overrides"]];

function pathStartsWith(path, prefix) {
	return (
		path.length >= prefix.length &&
		prefix.every((segment, index) => path[index] === segment)
	);
}

/** currentPath 的最后一段是依赖名，它前面的才是 section。 */
function isDependencyVersionPath(currentPath) {
	const section = currentPath.slice(0, -1);
	const exact = DEPENDENCY_SECTIONS.some(
		(candidate) =>
			candidate.length === section.length && pathStartsWith(section, candidate)
	);
	if (exact) {
		return true;
	}
	return NESTABLE_DEPENDENCY_SECTIONS.some((candidate) =>
		pathStartsWith(section, candidate)
	);
}

function isDisallowedVersion(version) {
	return (
		version.startsWith("^") ||
		version.startsWith("~") ||
		version === "latest" ||
		version === "*" ||
		version.startsWith(">") ||
		version.startsWith("<") ||
		version.startsWith("=")
	);
}

function checkDependencyVersions(obj, path = []) {
	const issues = [];

	for (const [key, value] of Object.entries(obj)) {
		const currentPath = [...path, key];

		if (typeof value === "object" && value !== null) {
			// 递归检查嵌套对象
			issues.push(...checkDependencyVersions(value, currentPath));
		} else if (
			typeof value === "string" &&
			isDependencyVersionPath(currentPath) &&
			isDisallowedVersion(value)
		) {
			issues.push({
				dependency: key,
				reason: getVersionErrorReason(value),
				// 违规位置要带上 section，否则同名依赖出现在两处时看不出说的是哪一处
				section: currentPath.slice(0, -1).join("."),
				version: value,
			});
		}
	}

	return issues;
}

function getVersionErrorReason(version) {
	if (version.startsWith("^")) {
		return "使用 ^ 前缀";
	}
	if (version.startsWith("~")) {
		return "使用 ~ 前缀";
	}
	if (version === "latest") {
		return "使用 latest";
	}
	if (version === "*") {
		return "使用 *";
	}
	if (
		version.startsWith(">") ||
		version.startsWith("<") ||
		version.startsWith("=")
	) {
		return "使用范围版本";
	}
	return "版本格式不正确";
}

function reportIssues(filePath, issues) {
	const lines = [
		`\n❌ ${filePath}`,
		`   发现 ${issues.length} 个依赖版本不符合规范:\n`,
		...issues.map(
			(issue) =>
				`   - ${issue.section}.${issue.dependency}: "${issue.version}" (${issue.reason})`
		),
		'\n   正确格式: 使用固定版本号，如 "1.2.3"',
		"   例外: workspace:* 和 catalog:* 可以使用\n",
	];
	// 整段一次输出：这个脚本的每个 console 调用都是一条 lint 警告，
	// 拼好再打能把警告数压在改动前的水平以下。
	console.error(lines.join("\n"));
}

/**
 * 检查单个文件。返回 `"ok"` / `"violation"` / `"error"` 三态而不是布尔：
 * 后两者必须能被调用方区分开，理由见文件头。
 */
function inspectPackageJson(filePath) {
	let pkg;
	try {
		pkg = JSON.parse(readFileSync(filePath, "utf-8"));
	} catch (error) {
		console.error(`\n⚠️  读不到或解析不了 ${filePath}: ${error.message}`);
		return "error";
	}

	const issues = checkDependencyVersions(pkg);
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
	for (const file of targets) {
		const status = inspectPackageJson(file);
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

	// 带上检查数：没有这个数，「通过」就无法和「什么都没查」区分开。
	console.log(`✅ package.json 检查通过（检查了 ${targets.length} 个文件）`);
	process.exit(0);
}

main();
