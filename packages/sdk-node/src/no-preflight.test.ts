import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));
const ALLOWED = new Set(["index.ts", "route-paths.ts"]);
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/.*/g;
const FRAMEWORK_PACKAGE = /wdio|playwright|jest|mocha|cucumber/;

const productionFiles = readdirSync(SRC_DIR).filter(
	(name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
);

function stripComments(source: string): string {
	return source.replaceAll(BLOCK_COMMENT, "").replaceAll(LINE_COMMENT, "");
}

describe("不做预检（§7.2 第 5 条）", () => {
	it("生产代码里没有第二处提到 GET /ingest/runs", () => {
		const offenders = productionFiles.filter((name) => {
			if (ALLOWED.has(name)) {
				return false;
			}
			const source = stripComments(readFileSync(`${SRC_DIR}${name}`, "utf8"));
			return (
				source.includes("INGEST_RUNS_ROUTE") || source.includes("/ingest/runs")
			);
		});
		expect(offenders).toEqual([]);
	});

	it("包里没有任何测试框架依赖——SDK 与框架不绑版本", () => {
		const manifest = JSON.parse(
			readFileSync(
				fileURLToPath(new URL("../package.json", import.meta.url)),
				"utf8"
			)
		) as Record<string, Record<string, string> | undefined>;
		const declared = Object.keys({
			...manifest.dependencies,
			...manifest.devDependencies,
			...manifest.peerDependencies,
		});
		for (const name of declared) {
			expect(name).not.toMatch(FRAMEWORK_PACKAGE);
		}
		expect(manifest.dependencies ?? {}).toEqual({});
	});
});
