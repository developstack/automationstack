import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalSlotProvider } from "./local";
import type { BinaryLookup } from "./local-binaries";
import { buildPlan, type PlanBinaryOptions } from "./local-plan";
import type {
	LocalProcess,
	LocalRuntime,
	SpawnLocalInput,
} from "./local-runtime";

/**
 * 「farm 点名的浏览器怎么兑现成一条命令行」。
 *
 * 单拎一个文件而不是并进 `local.test.ts`：那个文件已经顶到 300 行上限，而这里
 * 验的是另一件事——`local.test.ts` 问的是「槽位目录与进程组对不对」，这里问的是
 * 「选对二进制了吗」。
 */

const CONFIGURED_BIN = "/fake/bin/chrome";
const CHROMIUM_BIN = "/opt/chromium-140";
const NON_CHROMIUM = /chromium 系/;

const ENV_NAMES = {
	chrome: "FARM_CHROME_BIN",
	chromedriver: "FARM_CHROMEDRIVER_BIN",
};
const CHROMEDRIVER_BIN = "/fake/bin/chromedriver";

const LOOKUP: BinaryLookup = {
	isExecutable: (path) => path === CONFIGURED_BIN || path === CHROMEDRIVER_BIN,
	pathDirs: [],
};

const BROWSERS: BrowserCapability[] = [
	{
		available: true,
		bin: CHROMIUM_BIN,
		name: "chromium",
		version: "140.0.7339.80",
	},
];

const OPTIONS: PlanBinaryOptions = {
	binaryEnvNames: ENV_NAMES,
	browsers: BROWSERS,
	chromeBin: CONFIGURED_BIN,
	chromedriverBin: CHROMEDRIVER_BIN,
	lookup: LOOKUP,
};

function plan(browserName?: string, browserVersion?: string | null) {
	return buildPlan("cdp", {
		browserName,
		browserVersion,
		cdpPort: 41_000,
		headless: true,
		options: OPTIONS,
		profileDir: "/tmp/profile",
		wdPort: 41_000,
	});
}

describe("buildPlan：选二进制", () => {
	it("点名清单里有的浏览器，就起清单里那一个", () => {
		expect(plan("chromium", "140").command).toBe(CHROMIUM_BIN);
	});

	it("没点名 / 点名了但没中，都回落到配置的 chrome bin", () => {
		expect(plan().command).toBe(CONFIGURED_BIN);
		expect(plan("chrome", "99").command).toBe(CONFIGURED_BIN);
	});

	it("webdriver 模式起的是 chromedriver，但非 chromium 系照样当场报错", () => {
		const wd = buildPlan("webdriver", {
			browserName: "chromium",
			cdpPort: 41_000,
			headless: true,
			options: OPTIONS,
			profileDir: "/tmp/profile",
			wdPort: 41_001,
		});
		expect(wd.command).toBe(CHROMEDRIVER_BIN);
		expect(() =>
			buildPlan("webdriver", {
				browserName: "firefox",
				cdpPort: 41_000,
				headless: true,
				options: OPTIONS,
				profileDir: "/tmp/profile",
				wdPort: 41_001,
			})
		).toThrow(NON_CHROMIUM);
	});
});

let slotsRoot = "";

beforeEach(async () => {
	slotsRoot = await mkdtemp(join(tmpdir(), "farm-plan-slots-"));
});

afterEach(async () => {
	await rm(slotsRoot, { force: true, recursive: true });
});

describe("LocalProvider 把 acquire 上的浏览器原样交给命令行", () => {
	it("acquire 里点名 chromium 140 → spawn 的就是清单里那个路径", async () => {
		const spawned: SpawnLocalInput[] = [];
		const runtime: LocalRuntime = {
			killProcessGroup: () => Promise.resolve(),
			pickFreePort: () => Promise.resolve(41_000),
			spawn: (input): LocalProcess => {
				spawned.push(input);
				return { pid: 4242, readLogs: () => "" };
			},
		};
		const provider = createLocalSlotProvider({
			binaryEnvNames: ENV_NAMES,
			browsers: BROWSERS,
			chromeBin: CONFIGURED_BIN,
			headless: true,
			lookup: LOOKUP,
			runtime,
			slotsRoot,
		});
		await provider.acquire({
			browserName: "chromium",
			browserVersion: "140",
			expiresAtEpochSec: 1_800_000_000,
			image: "automationstack-browser-chromium:140",
			mode: "cdp",
			sessionId: "session-1",
		});
		expect(spawned[0]?.command).toBe(CHROMIUM_BIN);
	});
});
