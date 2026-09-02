import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";

import {
	type BinaryEnvNames,
	type BinaryLookup,
	resolveChromeBinary,
	resolveChromedriverBinary,
} from "./local-binaries";
import { pickBrowserBin } from "./local-browser-pick";
import type { FarmSlotMode } from "./types";

/**
 * 本机进程槽位的**命令行怎么拼**：起谁、带哪些旗标、哪些旗标要留给 caps 注入。
 *
 * 从 `local.ts` 切出来的一段纯函数（那个文件已经顶到仓库的 300 行上限）。切口
 * 是干净的：这里一行 IO、一个进程、一个目录操作都没有，输入是「模式 + 端口 +
 * 配置」，输出是一份 `SpawnPlan`。
 *
 * ## 不复刻容器里那几个旗标
 *
 * `entrypoint.sh` 的 `--no-sandbox` / `--disable-dev-shm-usage` 是**容器**的补丁
 * （非 root 用户跑不了 sandbox、/dev/shm 默认才 64M）。本机上两个都不该给：
 * 关掉 sandbox 是实打实降低本机安全性，而 /dev/shm 在 macOS/Linux 桌面上本来
 * 就够用。`--remote-debugging-address=0.0.0.0` 同理——本地连的是 127.0.0.1，
 * 绑 0.0.0.0 等于把一个无鉴权的 CDP 端口挂到局域网上。
 */

/**
 * 两种模式共用的 Chrome 旗标，语义对齐 `docker/browsers/chromium/entrypoint.sh`：
 * 不要首启向导、不要抢默认浏览器、不要后台网络活动（它们会污染 HAR）。
 */
const COMMON_CHROME_FLAGS = [
	"--no-first-run",
	"--no-default-browser-check",
	"--disable-background-networking",
	"--disable-backgrounding-occluded-windows",
	"--disable-renderer-backgrounding",
	"--disable-features=Translate,MediaRouter",
];

/** 无头旗标。`=new` 而不是老的 `--headless`：老的那个在 Chrome 132+ 已经没了。 */
const HEADLESS_FLAG = "--headless=new";

/** 拼命令行要用到的那几项配置。`LocalSlotProviderOptions` 是它的超集。 */
export interface PlanBinaryOptions {
	/** 两个路径各由哪个环境变量配，只用于错误文案。必填，理由见 `BinaryEnvNames`。 */
	binaryEnvNames: BinaryEnvNames;
	/**
	 * 本机探测出来的浏览器清单（`detect-browsers.ts`），由宿主进程在启动时探一次
	 * 注入进来。不给就退化成「永远用配置的那个 chrome bin」——也就是能力上报
	 * 之前的老行为。
	 */
	browsers?: readonly BrowserCapability[] | undefined;
	/** Chrome 可执行文件的显式路径，留空按平台探测。 */
	chromeBin?: string | undefined;
	/** chromedriver 的显式路径，留空查 PATH。只有 webdriver 模式才会用到。 */
	chromedriverBin?: string | undefined;
	/** 可执行文件查找边界，测试注入用。 */
	lookup?: BinaryLookup;
}

export interface SpawnPlan {
	args: string[];
	/** 要经 caps 注入给浏览器的参数（webdriver 模式才有，见契约 `browserArgs`）。 */
	browserArgs: string[];
	command: string;
	wdEndpoint: string | null;
}

export interface PlanInput {
	/** farm 下发的浏览器名，见 `AcquireSlotInput.browserName`。 */
	browserName?: string | undefined;
	browserVersion?: string | null | undefined;
	cdpPort: number;
	headless: boolean;
	options: PlanBinaryOptions;
	profileDir: string;
	wdPort: number;
}

/** 把「farm 点名的浏览器」兑现成一个本机路径，规则全在 `local-browser-pick.ts`。 */
function chromeBinFor(input: PlanInput): string {
	const { binaryEnvNames, browsers, chromeBin, lookup } = input.options;
	return pickBrowserBin({
		browserName: input.browserName,
		browsers,
		browserVersion: input.browserVersion,
		fallback: () => resolveChromeBinary(chromeBin, binaryEnvNames, lookup),
	});
}

/**
 * CDP 模式：farm 自己把 Chrome 拉起来，参数直接写在命令行上。
 *
 * `--remote-allow-origins=*` 不能省：Chrome 会按 Origin 头拒绝 DevTools 的 WS
 * 升级，而请求是客户端经 farm 转过来的，Origin 不受我们控制（entrypoint.sh 里
 * 是同一条注释）。
 */
function planCdp(input: PlanInput): SpawnPlan {
	const args = [
		`--remote-debugging-port=${input.cdpPort}`,
		`--user-data-dir=${input.profileDir}`,
		"--remote-allow-origins=*",
		...COMMON_CHROME_FLAGS,
		...(input.headless ? [HEADLESS_FLAG] : []),
		"about:blank",
	];
	return {
		args,
		// CDP 这条路径上没有 capabilities 这种东西，参数已经全在上面了。
		browserArgs: [],
		command: chromeBinFor(input),
		wdEndpoint: null,
	};
}

/**
 * WebDriver 模式：起 chromedriver，浏览器由它在 create-session 时拉起来。
 *
 * 于是 profile 与端口只能经 caps 注入（`browserArgs` + `cdpDebugPort`）。
 * **必须**指定 user-data-dir：不指定的话 chromedriver 会自建一个随机临时 profile，
 * 而孤儿清扫是按槽位目录认领的（`local-slots.ts` 文件头），认不出来就清不掉。
 *
 * 与 entrypoint.sh 的一处**有意偏离**：不传 `--allowed-ips=`（放行任意来源 IP）。
 * 容器里那么写是因为调用方在容器外；本机上调用方就是 farm 自己（127.0.0.1），
 * 而 chromedriver 默认只认 localhost——放行等于把一个能启动任意浏览器的端口
 * 开给整个局域网。
 *
 * ## 这条路径上「选二进制」只做了一半，是有原因的
 *
 * chromedriver 没有任何 CLI 旗标能指定浏览器二进制，那件事只能经
 * `goog:chromeOptions.binary` 从 caps 走，而 caps 是 farm 那侧拼的
 * （`apps/farm/src/wd/capabilities.ts`）。所以这里仍然调一次 `chromeBinFor`：
 * 它的**校验**部分照样生效（点名 firefox 当场报一句人话，而不是安静地跑 Chrome），
 * 只是选出来的那个路径这一轮还没有地方注入。宁可多这一次调用，也不要让
 * 「点名非 chromium 系」在两种模式下表现不一致。
 */
function planWebDriver(input: PlanInput): SpawnPlan {
	const { binaryEnvNames, chromedriverBin, lookup } = input.options;
	chromeBinFor(input);
	return {
		args: [`--port=${input.wdPort}`, "--allowed-origins=*"],
		browserArgs: [
			`--user-data-dir=${input.profileDir}`,
			...(input.headless ? [HEADLESS_FLAG] : []),
			...COMMON_CHROME_FLAGS,
		],
		command: resolveChromedriverBinary(chromedriverBin, binaryEnvNames, lookup),
		wdEndpoint: `http://127.0.0.1:${input.wdPort}`,
	};
}

export function buildPlan(mode: FarmSlotMode, input: PlanInput): SpawnPlan {
	return mode === "webdriver" ? planWebDriver(input) : planCdp(input);
}
