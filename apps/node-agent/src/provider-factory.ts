import {
	createDockerSlotProvider,
	createLocalSlotProvider,
	type SlotProvider,
} from "@automationstack/browser-slots";
import type {
	BrowserCapability,
	NodeBackend,
} from "@automationstack/farm-node-protocol/capabilities";

import type { AgentConfig } from "./config";

/**
 * 后端名 → 一个 `SlotProvider`。**全 agent 只有这一处认识两种后端**，
 * 与 `apps/farm/src/index.ts` 里那段 `FARM_PROVIDER` 二选一是同一条纪律：
 * 再往上（RPC 分发、隧道、心跳）只依赖 `SlotProvider` 那三个方法。
 */
export type ProviderFactory = (backend: NodeBackend) => SlotProvider;

/**
 * docker 后端**恒用 published-port + 127.0.0.1**，两个都不做成配置项。
 *
 * 理由是这条链路的物理事实：容器由**本机**的 daemon 起，端口发布在**本机**上，
 * 而要连它的也是**本机**这个 agent 进程——隧道的另一头才是 farm。
 * 换成 container-ip 的唯一效果是让 agent 去连一个它多半不在同一张网上的容器 IP
 * （macOS 上直接不通）；advertiseHost 换成别的机器名则等于宣称
 * 「端口发布在另一台机器上」，那与「本机 daemon」这个前提直接矛盾。
 * 留成配置项只会多两个配错了就没人看得懂的开关。
 */
const NODE_ENDPOINT_MODE = "published-port" as const;
const NODE_ADVERTISE_HOST = "127.0.0.1";

/**
 * `browsers` 是启动时探到的本机浏览器清单（`capabilities.ts`），只有 local 后端
 * 用得上：farm 下发 `browserName/browserVersion` 之后，兑现成哪个二进制要在这份
 * 清单里回查（`local-browser-pick.ts`）。不给就退化成「永远用配置的那个 chrome
 * bin」——也就是能力上报之前的老行为，本来就是对的默认值。
 */
export function createProviderFactory(
	config: AgentConfig,
	browsers?: readonly BrowserCapability[]
): ProviderFactory {
	return (backend) => {
		if (backend === "local") {
			return createLocalSlotProvider({
				// 报错文案里让人去改的变量名。节点上根本不存在 FARM_*，
				// 照原样透传就是把人指向一个不存在的开关（`BinaryEnvNames` 的文件注释）。
				binaryEnvNames: {
					chrome: "NODE_AGENT_CHROME_BIN",
					chromedriver: "NODE_AGENT_CHROMEDRIVER_BIN",
				},
				browsers,
				chromeBin: config.local.chromeBin,
				chromedriverBin: config.local.chromedriverBin,
				headless: config.local.headless,
				slotsRoot: config.local.slotsRoot,
			});
		}
		return createDockerSlotProvider({
			advertiseHost: NODE_ADVERTISE_HOST,
			dockerHost: config.docker.host,
			endpointMode: NODE_ENDPOINT_MODE,
			// container-ip 模式才用得上网络名，上面已经写死了不走那条路。
			network: undefined,
		});
	};
}
