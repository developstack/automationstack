#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isVendoredUiComponent } from "./vendored-ui.js";

const MAX_LINES = 300;

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

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*(\.(test|spec|config))?(\.[a-z]+)?$/;

const FILE_EXT_PATTERN = /\.(tsx?|jsx?)$/;

const GENERATED_FILES = ["apps/web/src/routeTree.gen.ts"];

function isGeneratedFile(filePath) {
	const absolute = resolve(filePath).replaceAll("\\", "/");
	return GENERATED_FILES.some((generated) =>
		absolute.endsWith(`/${generated}`)
	);
}

function checkFileName(filePath) {
	if (filePath.includes("/routes/")) {
		return { valid: true };
	}

	if (isGeneratedFile(filePath)) {
		return { valid: true };
	}

	const fileName = filePath.split("/").pop();
	const baseName = fileName.replace(FILE_EXT_PATTERN, "");

	if (EXCEPTIONS.includes(baseName)) {
		return { valid: true };
	}

	if (KEBAB_CASE.test(fileName)) {
		return { valid: true };
	}

	return {
		error: "文件名应使用 kebab-case，如: user-profile.ts",
		valid: false,
	};
}

function checkFileLines(content) {
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
			const nameCheck = checkFileName(file);
			if (!nameCheck.valid) {
				console.error(`\n❌ ${file}`);
				console.error(`   ${nameCheck.error}`);
				hasErrors = true;
			}

			if (!(isVendoredUiComponent(file) || isGeneratedFile(file))) {
				const content = readFileSync(file, "utf-8");
				const linesCheck = checkFileLines(content);
				if (!linesCheck.valid) {
					console.error(`\n❌ ${file}`);
					console.error(`   ${linesCheck.error}`);
					hasErrors = true;
				}
			}
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
		} catch {}
	}

	if (hasErrors) {
		console.error("\n❌ 文件规则检查失败");
		process.exit(1);
	}

	console.log("✅ 文件规则检查通过");
	process.exit(0);
}

main();
