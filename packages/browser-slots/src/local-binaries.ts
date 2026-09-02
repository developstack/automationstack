import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * 「本机上的 Chrome / chromedriver 在哪」这一个问题的全部答案。
 *
 * 单拎出来是因为它是**纯查找**：不起进程、不碰会话，输入是一个可选的 env 值加上
 * 一份「这个路径能不能执行」的判据，输出是一个绝对路径或者一条**带解决办法的**
 * 错误。后半句才是它值得单测的理由——本地模式最常见的失败就是「没装
 * chromedriver」，而那条错误信息是用户唯一能看到的东西，写成「ENOENT」等于没写。
 */

/**
 * 「配错了该去改哪个环境变量」的变量名，由**调用方**给。
 *
 * 从前这两个名字是写死的 `FARM_*`，那在 farm 进程里是对的，在
 * `apps/node-agent`（同一份 provider，跑在别人的执行机上）里就是**把人指向一个
 * 那台机器上根本不存在的开关**。而这两条错误信息的全部价值就在于「照着做能修好」，
 * 指错了开关等于没写。所以名字跟着调用方走：farm 传 `FARM_*`，agent 传
 * `NODE_AGENT_*`，包本身不预设任何一套（给默认值等于把旧的那个真相源留在原地）。
 *
 * 成对而不是单个传：chromedriver 找不到时的提示里要让人用
 * `"$<chrome 变量>" --version` 去查主版本，那条信息里同时出现两个名字。
 */
export interface BinaryEnvNames {
	/** 指 Chrome 可执行文件的那个变量名。 */
	chrome: string;
	/** 指 chromedriver 的那个变量名。 */
	chromedriver: string;
}

/** 可执行文件的存在性判据。测试注入一份假的，免得断言依赖开发机上装了什么。 */
export interface BinaryLookup {
	/** 这个绝对路径是不是一个可执行文件。 */
	isExecutable: (path: string) => boolean;
	/** PATH 里的目录，按顺序。 */
	pathDirs: string[];
}

/** macOS 上 Chrome/Chromium 的常规安装位置（.app 包内的真二进制，不是 open 那层）。 */
const MACOS_CHROME_PATHS = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** Linux 上按 PATH 找的那几个常见名字。发行版之间叫法不统一，全试一遍。 */
const LINUX_CHROME_NAMES = [
	"google-chrome",
	"google-chrome-stable",
	"chromium",
	"chromium-browser",
];

export function createBinaryLookup(): BinaryLookup {
	return {
		isExecutable: (path) => {
			try {
				accessSync(path, constants.X_OK);
				return true;
			} catch {
				return false;
			}
		},
		pathDirs: (process.env.PATH ?? "").split(delimiter).filter(Boolean),
	};
}

/** 在 PATH 里找一个名字，找不到回 null。 */
function findOnPath(name: string, lookup: BinaryLookup): string | null {
	for (const dir of lookup.pathDirs) {
		const candidate = join(dir, name);
		if (lookup.isExecutable(candidate)) {
			return candidate;
		}
	}
	return null;
}

/**
 * 显式配置优先。配了但不可执行**要报错而不是回落探测**：人明确指了一个路径，
 * 我们却安静地用了另一个浏览器，那种「跑起来了但不是你以为的那个」比起不来更贵。
 */
function configuredBinary(
	configured: string | undefined,
	lookup: BinaryLookup,
	label: string,
	envName: string
): string | null {
	if (configured === undefined) {
		return null;
	}
	if (lookup.isExecutable(configured)) {
		return configured;
	}
	throw new Error(`${envName} 指向的 ${label} 不存在或不可执行：${configured}`);
}

/**
 * 找 Chrome/Chromium。顺序：显式配置 → 平台常规位置 → PATH。
 *
 * `envNames` 只影响错误文案，不影响查找本身，但它是**必填**的：这两条错误是
 * 用户唯一能看到的东西，见 `BinaryEnvNames`。
 */
export function resolveChromeBinary(
	configured: string | undefined,
	envNames: BinaryEnvNames,
	lookup: BinaryLookup = createBinaryLookup()
): string {
	const explicit = configuredBinary(
		configured,
		lookup,
		"Chrome 可执行文件",
		envNames.chrome
	);
	if (explicit !== null) {
		return explicit;
	}
	const absolute =
		process.platform === "darwin"
			? MACOS_CHROME_PATHS.find((path) => lookup.isExecutable(path))
			: undefined;
	if (absolute !== undefined) {
		return absolute;
	}
	for (const name of LINUX_CHROME_NAMES) {
		const found = findOnPath(name, lookup);
		if (found !== null) {
			return found;
		}
	}
	throw new Error(
		"找不到 Chrome/Chromium 可执行文件。装一个（macOS: brew install --cask google-chrome），" +
			`或用 ${envNames.chrome} 指到它，例如 ${envNames.chrome}="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"。`
	);
}

/**
 * 找 chromedriver。顺序：显式配置 → PATH。
 *
 * 错误信息里必须带**两条**可执行的装法与「版本要对齐」这句话：chromedriver 与
 * Chrome 的主版本不一致时，报出来的是一句「This version of ChromeDriver only
 * supports Chrome version N」，而那条信息要等会话真的建到一半才出现。
 */
export function resolveChromedriverBinary(
	configured: string | undefined,
	envNames: BinaryEnvNames,
	lookup: BinaryLookup = createBinaryLookup()
): string {
	const explicit = configuredBinary(
		configured,
		lookup,
		"chromedriver",
		envNames.chromedriver
	);
	if (explicit !== null) {
		return explicit;
	}
	const found = findOnPath("chromedriver", lookup);
	if (found !== null) {
		return found;
	}
	throw new Error(
		"找不到 chromedriver（本地 WebDriver 会话必需，CDP/Playwright 会话不需要它）。" +
			"装法二选一：`brew install --cask chromedriver`，" +
			"或 `npx @puppeteer/browsers install chromedriver@<Chrome 主版本>`" +
			`（主版本必须与本机 Chrome 一致，用 \`"$${envNames.chrome}" --version\` 查）；` +
			`装到别处就用 ${envNames.chromedriver} 指过去。`
	);
}
