import { basename } from "node:path";

import { browser } from "@wdio/globals";

import AutomationStackWdioReporter from "./adapters/wdio-reporter.ts";
import AutomationStackLauncherService from "./adapters/wdio-service.ts";
import { saveFailureScene } from "./src/failure-artifacts.ts";
import { extractSourceRef } from "./src/source-ref.ts";

const MAX_INSTANCES = 2;

const CHROME_ARGS = ["--headless=new", "--disable-gpu", "--no-sandbox"];

export const config: WebdriverIO.Config = {
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
	specs: ["./tests/wdio/**/*.spec.ts"],
	waitforTimeout: 10_000,
};
