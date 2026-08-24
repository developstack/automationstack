#!/usr/bin/env node

/**
 * 自定义代码规则检查
 * - 文件命名: 统一 kebab-case（含 .tsx 组件文件）
 *   - 允许 .test / .spec / .config 后缀（如 foo.test.ts、vite.config.ts），
 *     主名部分仍须为 kebab-case
 * - 文件行数: 不超过 300 行
 *
 * 本仓库偏差说明:
 * - apps/web 使用 TanStack Start file router，`src/routes/` 下的文件名
 *   （如 __root.tsx、$projectId.tsx、items.$id.tsx）是框架强制约定，
 *   无法满足 kebab-case 规则。因此路径中含 `/routes/` 的文件
 *   跳过命名检查（行数检查仍然适用）。
 * - 生成物（GENERATED_FILES）跳过命名检查与行数检查两项，理由见常量旁注释。
 * - `packages/ui/src/components/`（vendored 的 shadcn 组件原件）跳过行数检查，
 *   上游多个组件本身就超过 300 行（sidebar 单文件约 700 行），拆分会让本地
 *   文件与 registry 永久对不上。命名检查仍然适用——shadcn 本来就是
 *   kebab-case，两者不冲突。完整理由见 scripts/vendored-ui.js。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isVendoredUiComponent } from "./vendored-ui.js";

const MAX_LINES = 300;

// 常见例外文件名（约定俗成，无需检查命名）
const EXCEPTIONS = [
	"index",
	"_app",
	"_document",
	"_error",
	"layout",
	"loading",
	"error",
	"page",
	"template",
	"not-found",
	"route",
	"routes",
	"server",
	"client",
	"main",
	"app",
	"root",
];

// kebab-case 正则
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*(\.(test|spec|config))?(\.[a-z]+)?$/;

// 文件扩展名正则（顶层定义，避免循环内创建）
const FILE_EXT_PATTERN = /\.(tsx?|jsx?)$/;

// 生成物清单：由构建插件写出、不由人维护的文件。
// - apps/web/src/routeTree.gen.ts 由 @tanstack/router-plugin 生成：文件名是插件
//   写死的（过不了 kebab-case），行数随路由数量单调增长（过不了 300 行上限），
//   而它每次生成都会被整体覆盖，任何为迁就门禁做的改动下一次 dev/build 就没了。
//   它进版本库是有意的（router.tsx 直接 import 它，而 check-types 走的是
//   tsc --noEmit 不经过 vite，忽略掉会让全新 clone 与 CI 编不过），
//   理由见 .gitignore 里那段注释。
// 按仓库根起算的完整路径逐条列出，不用 `*.gen.ts` 之类的后缀通配——
// 通配会顺带放过手写文件，而豁免的依据是「这个文件由插件覆盖」，不是它的名字。
const GENERATED_FILES = ["apps/web/src/routeTree.gen.ts"];

/** 兼容绝对路径与相对路径：先归一成绝对路径，再要求完整路径段匹配。 */
function isGeneratedFile(filePath) {
	const absolute = resolve(filePath).replaceAll("\\", "/");
	return GENERATED_FILES.some((generated) =>
		absolute.endsWith(`/${generated}`)
	);
}

function checkFileName(filePath) {
	// TanStack Start file router 路由文件命名由框架约定，跳过命名检查
	if (filePath.includes("/routes/")) {
		return { valid: true };
	}

	// 生成物的文件名由插件写死，改不了
	if (isGeneratedFile(filePath)) {
		return { valid: true };
	}

	const fileName = filePath.split("/").pop();
	const baseName = fileName.replace(FILE_EXT_PATTERN, "");

	// 检查例外文件名
	if (EXCEPTIONS.includes(baseName)) {
		return { valid: true };
	}

	// 所有文件统一使用 kebab-case
	if (KEBAB_CASE.test(fileName)) {
		return { valid: true };
	}

	return {
		error: "文件名应使用 kebab-case，如: user-profile.ts",
		valid: false,
	};
}

function checkFileLines(content) {
	// 与 `wc -l` 一致：统计换行符个数，而不是 split 出来的段数。
	// 以换行结尾的文件（绝大多数）用 split("\n").length 会多算一行，
	// 使 300 行的上限实际卡在 299 行。
	const lines = content.split("\n").length - 1;

	if (lines > MAX_LINES) {
		return {
			error: `文件超过 ${MAX_LINES} 行 (当前: ${lines} 行)`,
			valid: false,
		};
	}

	return { valid: true };
}

function main() {
	const files = process.argv.slice(2);

	if (files.length === 0) {
		console.log("没有文件需要检查");
		process.exit(0);
	}

	let hasErrors = false;

	for (const file of files) {
		try {
			// 检查文件命名
			const nameCheck = checkFileName(file);
			if (!nameCheck.valid) {
				console.error(`\n❌ ${file}`);
				console.error(`   ${nameCheck.error}`);
				hasErrors = true;
			}

			// 检查文件行数（vendored 的 shadcn 组件、生成物豁免）
			if (!(isVendoredUiComponent(file) || isGeneratedFile(file))) {
				const content = readFileSync(file, "utf-8");
				const linesCheck = checkFileLines(content);
				if (!linesCheck.valid) {
					console.error(`\n❌ ${file}`);
					console.error(`   ${linesCheck.error}`);
					hasErrors = true;
				}
			}
		} catch {
			// 忽略无法读取的文件
		}
	}

	if (hasErrors) {
		console.error("\n❌ 文件规则检查失败");
		process.exit(1);
	}

	console.log("✅ 文件规则检查通过");
	process.exit(0);
}

main();
