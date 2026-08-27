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
 * ⚠️ **`catalog:` 的真实版本不在这道门禁的射程内。** 全仓 166 处依赖条目里
 * 59 条（36%）写的是 `catalog:`，它们的版本落在 `pnpm-workspace.yaml`，
 * 而这个脚本只读传进来的 package.json，从不读那个文件。豁免 catalog 是必须的
 * （否则 catalog 根本没法用），但代价要说清楚：
 * 「✅ 检查通过（12 个文件，166 处依赖）」**不等于** 166 条的版本写法都被查过，
 * 只等于其中 107 条被查过，另外 59 条被指到了一个没人检查的地方。
 *
 * 另外把「没检查成」（文件读不到、JSON 坏了）与「检查不通过」（版本写法违规）
 * 分成了两个出口。混在一起时，一个 ENOENT 会长得和真违规一模一样：
 * 现在表现为吵闹的假红，而只要有人为了消噪加一句「文件不存在就跳过」，
 * 同一段代码立刻翻成假绿。
 *
 * 判定规则（位置匹配 + 值白名单）在 ./package-version-rules.js，拆出去只为
 * 300 行上限；这个文件留的是 CLI：读文件、拼报错、决定退出码。
 */

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
	// 整段一次输出：这个脚本的每个 console 调用都是一条 lint 警告，
	// 拼好再打能把警告数压在改动前的水平以下。
	console.error(lines.join("\n"));
}

/**
 * 检查单个文件。返回 `"ok"` / `"violation"` / `"error"` 三态而不是布尔：
 * 后两者必须能被调用方区分开，理由见文件头。
 */
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
	// 整批共用一个计数器：要的是「这次总共命中了多少处依赖」这一个数。
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

	/*
	 * 两个数都要打，因为它们各自能证伪一件不同的事：
	 *   文件数——文件确实被打开了；
	 *   依赖数——**路径匹配器确实命中过东西**。
	 * 只打文件数的话，匹配器写坏成零命中时输出仍然是「✅ 通过（12 个文件）」，
	 * 和全部合规一字不差——正是这道检查这次要修掉的那种假绿，只是降了一层。
	 * 而且依赖数会随改动浮动，文件数几乎不变：会动的那个数才证明这次走过了那条路。
	 */
	/*
	 * 命中 0 处**不**报错：只有 scripts / exports 的存根 package.json 是合法的，
	 * 硬失败会把它变成假红。这里靠的是「0 处依赖」这行字与「166 处依赖」长得不一样——
	 * 假绿的定义是输出无从分辨，不是数值不吉利。
	 */
	console.log(
		`✅ package.json 检查通过（${targets.length} 个文件，${counter.checked} 处依赖）`
	);
	process.exit(0);
}

main();
