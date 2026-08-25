import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * §7.2 第 5 条的守卫：**SDK 不做预检**。
 *
 * 正常路径只有一次 `POST /ingest/executions`——跑之前没有任何需要人确认的配置，
 * 归属由用例的 sourceRef 自己解析（§3.7）。`GET /ingest/runs` 只是把候选摆出来
 * 给人看，SDK 不依赖它就能上报。
 *
 * 这条规则很容易在某次「加个友好提示」的改动里被悄悄破坏（先查一下有哪些任务，
 * 再决定报不报），而破坏之后没有任何测试会红——它不改变任何返回值。
 * 所以这里直接扫源码：除了声明它的 `route-paths.ts` 与把它转出去给人写排查
 * 脚本的 `index.ts`，任何生产文件都不许提到它。
 */

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));
const ALLOWED = new Set(["index.ts", "route-paths.ts"]);
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/.*/g;
const FRAMEWORK_PACKAGE = /wdio|playwright|jest|mocha|cucumber/;

const productionFiles = readdirSync(SRC_DIR).filter(
	(name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
);

/** 注释里当然会写到它（每处都在解释「为什么不调」），只扫代码。 */
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
		// 运行时依赖必须是零：附件走预签名 PUT，只需要 fetch，不引 S3 SDK（D28）。
		expect(manifest.dependencies ?? {}).toEqual({});
	});
});
