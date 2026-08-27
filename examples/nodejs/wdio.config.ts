import { basename } from "node:path";

import { browser } from "@wdio/globals";

import AutomationStackWdioReporter from "./adapters/wdio-reporter.ts";
import AutomationStackLauncherService from "./adapters/wdio-service.ts";
import { saveFailureScene } from "./src/failure-artifacts.ts";
import { extractSourceRef } from "./src/source-ref.ts";

/**
 * 切面的接线处：`reporters` 与 `services` 都是 wdio 自己的官方扩展位。
 *
 * - `AutomationStackWdioReporter` 跑在每个 worker 里，只攒 + 落盘；
 * - `AutomationStackLauncherService` 跑在总控里，`onComplete` 回捡 + 唯一一次上报。
 *
 * `services` 里直接放类（而不是包名字符串）时，wdio 会把它当 **launcher service**
 * 实例化（`@wdio/utils` 的 `initializeLauncherService`：
 * `if (typeof service === 'function' && !serviceName) launcherServices.push(new service(...))`）。
 */

/**
 * ⚠️ **必须真的把多进程跑出来**：`maxInstances` ≥ 2 且至少两个 spec 文件。
 * 只有一个进程时「跨进程汇聚」这件事等于没测——而它恰恰是这份 wdio 示例
 * 唯一想说明的东西。两个 spec、两个 worker，`onComplete` 会打出回捡到几份 spool。
 */
const MAX_INSTANCES = 2;

/** 真浏览器、无头。wdio ≥ 8.14 自己下载 Chrome for Testing 与 chromedriver。 */
const CHROME_ARGS = ["--headless=new", "--disable-gpu", "--no-sandbox"];

export const config: WebdriverIO.Config = {
	/**
	 * 失败就留现场。**这是切面的职责，测试文件里不该为它写一行 try/catch。**
	 * `afterTest` 跑在 worker 里、`browser` 还活着，所以这里能拿到**真截图**
	 * （node:test 与 vitest 那两轮没有浏览器，落的是占位 PNG）。
	 */
	afterTest: async (test, _context, result) => {
		if (result.passed) {
			return;
		}
		const sourceRef = extractSourceRef(test.title);
		if (!sourceRef) {
			return;
		}
		const png = await browser.takeScreenshot();
		await saveFailureScene({
			framework: "wdio",
			log: [
				`spec  ${basename(test.file ?? "")}`,
				`title ${test.title}`,
				`url   ${await browser.getUrl()}`,
				"",
				result.error?.stack ?? String(result.error),
			].join("\n"),
			screenshotPng: Buffer.from(png, "base64"),
			sourceRef,
		});
	},

	baseUrl: "http://localhost:3000",

	capabilities: [
		{
			browserName: "chrome",
			"goog:chromeOptions": { args: CHROME_ARGS },
		},
	],

	framework: "mocha",
	logLevel: "error",
	maxInstances: MAX_INSTANCES,
	mochaOpts: { timeout: 60_000, ui: "bdd" },
	reporters: ["spec", [AutomationStackWdioReporter, {}]],
	runner: "local",
	services: [[AutomationStackLauncherService, {}]],
	// 两个文件 → 两个 worker。见上面 MAX_INSTANCES 那段。
	specs: ["./tests/wdio/**/*.spec.ts"],
	waitforTimeout: 10_000,
};
