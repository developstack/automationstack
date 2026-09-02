import {
	createDockerSlotProvider,
	createLocalSlotProvider,
	detectLocalBrowsers,
} from "@automationstack/browser-slots";
import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
import type {
	BrowserCapability,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";

import { farmConfig } from "../config";
import { BUILTIN_SOURCE_NAME, type SourceRegistry } from "./source-registry";

/**
 * 内建伪节点：把 `FARM_PROVIDER` 选出来的那个 provider 收编成一个源。
 *
 * ## 为什么它自己也要报能力
 *
 * 收编的整个意义是「内建不是特殊路径」。调度按能力筛选之后，如果只有实机节点
 * 有能力清单、内建源是一个能力未知的洞，那筛选就必须为它留一条例外——而例外
 * 一旦存在，「点名 local 要 firefox」这种请求就会绕过闸门，一路跑到 acquire
 * 才在 60 秒后失败。所以它照样探、照样报，只是探的人是 farm 自己。
 *
 * ## 两种后端各自探什么
 *
 * - `FARM_PROVIDER=local`：跑 `detectLocalBrowsers`，与 agent 在实机上做的
 *   是同一个函数，于是「farm 本机」和「一台实机节点」在能力这件事上同构。
 * - `FARM_PROVIDER=docker`：真相是**镜像目录**（`farm_browsers`），不是
 *   宿主机上已经拉下来的镜像。理由与 `source-capability.ts` 里那段一致：
 *   已拉清单是一张会过期的快照，按它筛会把「刚加进目录、还没 pull」的浏览器
 *   永久排除。停用的行不进清单——`enabled: false` 就是管理员说的「别再用它」。
 *
 * 探测是**启动时一次**，之后不再刷新：内建源没有 agent，也就没有重探 RPC 的对端；
 * 真要换浏览器，farm 进程本来也得重启（`FARM_CHROME_BIN` 是启动时读的）。
 */

/** 目录行 → 能力条目。`bin` 放镜像 tag，与 `imagesToCapabilities` 的口径一致。 */
function browserRowToCapability(row: FarmBrowser): BrowserCapability {
	return {
		available: true,
		bin: row.image,
		name: row.browser,
		// `latest` 是「哪个版本都行」的约定 tag，报成一个假版本号只会误导筛选。
		version: row.version === "latest" ? null : row.version,
	};
}

export interface BuiltinCapabilityDeps {
	listBrowsers: () => Promise<FarmBrowser[]>;
}

/** 探一次内建源的能力。docker 模式要读库，所以它是异步的。 */
export async function probeBuiltinCapabilities(
	deps: BuiltinCapabilityDeps
): Promise<NodeCapabilities> {
	const detectedAtEpochSec = Math.floor(Date.now() / 1000);
	if (farmConfig.provider === "local") {
		return {
			backend: "local",
			browsers: detectLocalBrowsers({ chromeBin: farmConfig.local.chromeBin }),
			detectedAtEpochSec,
		};
	}
	const rows = await deps.listBrowsers();
	return {
		backend: "docker",
		browsers: rows.filter((row) => row.enabled).map(browserRowToCapability),
		detectedAtEpochSec,
	};
}

/** 按 `FARM_PROVIDER` 造 provider。**只有这一处认识两种实现**。 */
function createBuiltinProvider() {
	if (farmConfig.provider === "local") {
		return createLocalSlotProvider({
			// 报错文案里让人去改的变量名。farm 进程读的是 FARM_*，
			// 见 `browser-slots` 的 `BinaryEnvNames`。
			binaryEnvNames: {
				chrome: "FARM_CHROME_BIN",
				chromedriver: "FARM_CHROMEDRIVER_BIN",
			},
			chromeBin: farmConfig.local.chromeBin,
			chromedriverBin: farmConfig.local.chromedriverBin,
			headless: farmConfig.local.headless,
			slotsRoot: farmConfig.local.slotsRoot,
		});
	}
	return createDockerSlotProvider({
		advertiseHost: farmConfig.docker.advertiseHost,
		dockerHost: farmConfig.docker.host,
		endpointMode: farmConfig.docker.endpointMode,
		network: farmConfig.docker.network,
	});
}

/**
 * 把内建源登记进注册表。
 *
 * 能力先留 null，等启动对账之后再 `updateCapabilities` 换上去——docker 模式的
 * 探测要读库，而这一行跑在模块顶层，不能 await。留 null 的那一小段窗口里
 * 进来的会话会被判「这个源提供不了」，这是刻意的：开闸本来就在对账之后
 * （`index.ts` 的 `runStartupReconcile`），那时能力已经填好了。
 */
export function registerBuiltinSource(sources: SourceRegistry): void {
	sources.add({
		backend: farmConfig.provider,
		capabilities: null,
		capacity: farmConfig.session.maxSessions,
		kind: "builtin",
		name: BUILTIN_SOURCE_NAME,
		// 内建源在 `farm_nodes` 里没有行，所以它跑的会话 `node_id` 恒为 null。
		nodeId: null,
		provider: createBuiltinProvider(),
		// 没有 agent 可问，也就没有重探这回事（`SlotSource.refresh`）。
		refresh: null,
	});
}
