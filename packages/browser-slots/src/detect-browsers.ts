import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";

import { type BinaryLookup, createBinaryLookup } from "./local-binaries";

/**
 * 「这台机器上装了哪些浏览器」的探测（local 后端的能力上报，`capabilities.ts`
 * 文件头的模型转向）。
 *
 * ## 与 `local-binaries.ts` 的分工
 *
 * 那个文件回答的是**一个**问题：「我现在要开一个槽位，Chrome 在哪」，答不上来
 * 就抛一条带装法指引的错。这个文件回答的是另一个问题：「你都有什么」，
 * 它**永不抛错**——一台什么都没装的机器该如实报一个空清单，而不是让 agent
 * 起不来。两者共用 `BinaryLookup` 那个查找边界，但语气正好相反。
 *
 * ## 为什么要真的跑一次 `--version`
 *
 * 版本是筛选的输入（`acquireParams.browserVersion`），而路径里读不出版本：
 * macOS 上永远是 `/Applications/Google Chrome.app/…`，Linux 上永远是
 * `google-chrome`。靠包管理器元数据同样不行——三种发行版三套查法，还漏掉
 * 手动解压到某个目录的那份。跑一次 `--version` 是唯一在所有装法下都成立的答案，
 * 代价是每个候选一次几十毫秒的子进程，只在启动与「重新探测」时付。
 */

/** 探测的外部世界边界。测试注入一份假的，免得断言依赖开发机上装了什么。 */
export interface BrowserProbe {
	/** 路径存在性 / PATH 目录，与 `local-binaries.ts` 共用同一个类型。 */
	lookup: BinaryLookup;
	/** 跑 `<bin> --version` 并把 stdout 交回来。跑不起来（不存在、超时、非零退出）回 null。 */
	readVersion: (bin: string) => string | null;
}

/** `--version` 的超时。一个浏览器打印自己的版本号不该超过这个数，超了就是它有问题。 */
const VERSION_TIMEOUT_MS = 5000;

/** 顶层常量而不是循环内新建（仓库规约：正则不进循环）。 */
const VERSION_PATTERN = /\d+(?:\.\d+)+/;

export function createBrowserProbe(): BrowserProbe {
	return {
		lookup: createBinaryLookup(),
		readVersion: (bin) => {
			try {
				return execFileSync(bin, ["--version"], {
					encoding: "utf8",
					// stdin 关掉、stderr 丢掉：某些 Chrome 构建会往 stderr 刷一堆
					// dbus/沙箱告警，混进版本串里只会让解析多一层运气。
					stdio: ["ignore", "pipe", "ignore"],
					timeout: VERSION_TIMEOUT_MS,
				});
			} catch {
				// 探测**不抛**（文件头）：跑不出版本的浏览器仍然是一条能力，
				// 只是版本未知。
				return null;
			}
		},
	};
}

interface Candidate {
	channel?: string;
	/** macOS 是绝对路径，Linux 是要去 PATH 里找的名字。 */
	locator: string;
	name: string;
}

/** macOS 上这四个浏览器的常规安装位置（.app 包内的真二进制，不是 `open` 那层）。 */
const MACOS_CANDIDATES: Candidate[] = [
	{
		channel: "stable",
		locator: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		name: "chrome",
	},
	{
		channel: "beta",
		locator:
			"/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
		name: "chrome",
	},
	{
		locator: "/Applications/Chromium.app/Contents/MacOS/Chromium",
		name: "chromium",
	},
	{
		channel: "stable",
		locator: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		name: "edge",
	},
];

/** Linux 上按 PATH 找的那几个名字。发行版之间叫法不统一，全试一遍。 */
const LINUX_CANDIDATES: Candidate[] = [
	{ channel: "stable", locator: "google-chrome", name: "chrome" },
	{ channel: "stable", locator: "google-chrome-stable", name: "chrome" },
	{ channel: "beta", locator: "google-chrome-beta", name: "chrome" },
	{ locator: "chromium", name: "chromium" },
	{ locator: "chromium-browser", name: "chromium" },
	{ channel: "stable", locator: "microsoft-edge", name: "edge" },
	{ channel: "stable", locator: "microsoft-edge-stable", name: "edge" },
];

const MACOS_SAFARI_BIN = "/Applications/Safari.app/Contents/MacOS/Safari";

/**
 * Safari 探得到但恒 `available: false`，理由是 plan D13 裁定的**三条硬伤**。
 *
 * 为什么要报一条注定用不了的能力：不报的话，一个 macOS 节点在平台上看起来就是
 * 「没有 Safari」，于是每隔一阵就会有人问一次「这台 Mac 上明明有 Safari，
 * 为什么派不过去」。报出来并把三条理由写在这里，那个问题只需要被回答一次。
 */
const SAFARI_REASON =
	"本期不接入：Safari 没有 CDP（recorder 全瞎）、safaridriver 只支持单会话、Playwright 驱动不了真 Safari（plan D13）";

/** 从 `Google Chrome 141.0.7390.54` 这类输出里取版本号。取不到回 null。 */
export function parseBrowserVersion(raw: string | null): string | null {
	if (raw === null) {
		return null;
	}
	return VERSION_PATTERN.exec(raw)?.[0] ?? null;
}

/**
 * 从 `--version` 的输出里认浏览器名。**chromium 必须排在 chrome 前面**：
 * 一些发行版的 Chromium 会自称 `Chromium ... (Chrome-compatible)`，
 * 先判 chrome 就会把它认成 Chrome。
 */
function parseBrowserName(raw: string | null): string {
	const text = (raw ?? "").toLowerCase();
	if (text.includes("edge")) {
		return "edge";
	}
	if (text.includes("chromium")) {
		return "chromium";
	}
	return "chrome";
}

/** 候选在本机的绝对路径；不存在回 null。 */
function locate(candidate: Candidate, probe: BrowserProbe): string | null {
	if (candidate.locator.startsWith("/")) {
		return probe.lookup.isExecutable(candidate.locator)
			? candidate.locator
			: null;
	}
	for (const dir of probe.lookup.pathDirs) {
		const full = join(dir, candidate.locator);
		if (probe.lookup.isExecutable(full)) {
			return full;
		}
	}
	return null;
}

/**
 * 显式配置的那个 bin 也进清单。
 *
 * 它必须在清单里，否则会出现一种很难查的状态：运维用 `NODE_AGENT_CHROME_BIN`
 * 指了一个装在非常规位置的 Chrome，槽位开得起来（`local-binaries.ts` 优先用它），
 * 但平台上这台机器一个浏览器都没有，于是调度永远筛不中它。
 *
 * 配了却不可执行时报一条 `available: false`：这是配置错，而「清单里少一条」
 * 说不出「你指的那个路径不存在」这句话。
 */
function configuredEntry(
	bin: string,
	probe: BrowserProbe
): BrowserCapability | null {
	if (!probe.lookup.isExecutable(bin)) {
		return {
			available: false,
			bin,
			name: "chrome",
			reason: `显式配置的浏览器路径不存在或不可执行：${bin}`,
			version: null,
		};
	}
	const raw = probe.readVersion(bin);
	return {
		available: true,
		bin,
		name: parseBrowserName(raw),
		version: parseBrowserVersion(raw),
	};
}

export interface DetectBrowsersInput {
	/** 调用方显式配置的 Chrome 路径（agent 是 `NODE_AGENT_CHROME_BIN`）。 */
	chromeBin?: string | undefined;
	/** 默认 `process.platform`。用例传死值，好让两套路径都可复现。 */
	platform?: NodeJS.Platform;
	probe?: BrowserProbe;
}

/** 同名同通道同版本只留一条：Linux 上 `google-chrome` 与 `google-chrome-stable` 常是同一个二进制。 */
function dedupeKey(entry: BrowserCapability): string {
	return `${entry.name}/${entry.channel ?? ""}/${entry.version ?? ""}`;
}

/**
 * 走一遍平台的标准路径清单。单拎出来是为了把 `detectLocalBrowsers` 的分支数
 * 压回可读范围（仓库 lint 的 complexity 上限是 10），切口是干净的：
 * 这里只认「路径 → 条目」，去重与优先级留在调用方。
 */
function candidateEntries(
	platform: NodeJS.Platform,
	probe: BrowserProbe
): BrowserCapability[] {
	const candidates =
		platform === "darwin" ? MACOS_CANDIDATES : LINUX_CANDIDATES;
	const rows: BrowserCapability[] = [];
	for (const candidate of candidates) {
		const bin = locate(candidate, probe);
		if (bin === null) {
			continue;
		}
		rows.push({
			available: true,
			bin,
			...(candidate.channel === undefined
				? {}
				: { channel: candidate.channel }),
			name: candidate.name,
			version: parseBrowserVersion(probe.readVersion(bin)),
		});
	}
	return rows;
}

/**
 * Safari：探到就报，但恒为 `available: false`（理由见 `SAFARI_REASON`）。
 *
 * 不跑 `--version`：Safari 根本不认这个参数，跑它只会白等一次超时。
 */
function safariEntry(
	platform: NodeJS.Platform,
	probe: BrowserProbe
): BrowserCapability | null {
	if (platform !== "darwin" || !probe.lookup.isExecutable(MACOS_SAFARI_BIN)) {
		return null;
	}
	return {
		available: false,
		bin: MACOS_SAFARI_BIN,
		name: "safari",
		reason: SAFARI_REASON,
		version: null,
	};
}

/**
 * 探本机浏览器。**不抛**，最坏情况是回一个空数组。
 *
 * 顺序有意义：显式配置的排最前，它是运维的明确意图，筛选时同名同版本先中它。
 */
export function detectLocalBrowsers(
	input: DetectBrowsersInput = {}
): BrowserCapability[] {
	const probe = input.probe ?? createBrowserProbe();
	const platform = input.platform ?? process.platform;
	const configured =
		input.chromeBin === undefined || input.chromeBin === ""
			? null
			: configuredEntry(input.chromeBin, probe);
	const found: (BrowserCapability | null)[] = [
		configured,
		...candidateEntries(platform, probe),
		safariEntry(platform, probe),
	];
	const entries: BrowserCapability[] = [];
	const seen = new Set<string>();
	for (const entry of found) {
		if (entry === null) {
			continue;
		}
		const key = dedupeKey(entry);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		entries.push(entry);
	}
	return entries;
}
