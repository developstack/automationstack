import {
	detectLocalBrowsers,
	imagesToCapabilities,
	listPulledImages,
} from "@automationstack/browser-slots";
import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";

import type { AgentConfig } from "./config";

/**
 * 「这台机器能提供哪些浏览器」的探测（plan §12 的模型转向：**节点是主体，
 * 浏览器是节点上报的能力**）。
 *
 * 与 `backends.ts` 的分工是一层套一层：那边回答「有哪几种后端」，这边回答
 * 「某一种后端下有哪些浏览器」。两处纪律相同——**探不到就如实不报**，
 * 绝不为了让节点看起来能干而编一条能力出来。调度是照着这份清单派活的，
 * 编出来的那一条会在 acquire 阶段才炸，而那时会话行、配额、finalize 全都已经发生了。
 *
 * 实现全在 `@automationstack/browser-slots` 里（两种后端的浏览器怎么开是那个包
 * 的事），这个文件只做一件事：按后端选一条路，套上 `detectedAtEpochSec` 的信封。
 */

const SECOND_MS = 1000;

/** 现探现报的探测器。绑定配置，不绑定后端——后端要等 helloAck 才定得下来。 */
export type CapabilityDetector = (
	backend: NodeBackend
) => Promise<NodeCapabilities>;

/**
 * hello 里报哪一种后端的能力。
 *
 * 平台登记的后端要等 helloAck 才知道，而 hello 必须先说话，所以这里只能挑一个：
 * **有 Docker 就报 docker**。理由是这两份清单的信息量不对等——docker 那份是
 * 「已拉取的镜像」，运维照着它就能判断要不要去 pull；local 那份在任何一台
 * 装了 Chrome 的机器上都长得差不多。挑错了也不致命：接上之后平台点一次
 * 「重新探测」（`detectCapabilities` RPC）拿到的就是登记后端的那一份。
 */
export function preferredBackend(
	backends: readonly NodeBackend[]
): NodeBackend {
	return backends.includes("docker") ? "docker" : "local";
}

function nowEpochSec(): number {
	return Math.floor(Date.now() / SECOND_MS);
}

/**
 * docker 后端只报**已拉取**的镜像。
 *
 * 「能不能拉到」是 registry 的属性不是这台机器的能力，而一次冷拉可能是几分钟——
 * 把没拉过的镜像也报成能力，等于把调度器引向一条大概率超时的路。
 */
async function detectDocker(config: AgentConfig): Promise<NodeCapabilities> {
	const images = await listPulledImages(config.docker.host);
	return {
		backend: "docker",
		browsers: imagesToCapabilities(images),
		detectedAtEpochSec: nowEpochSec(),
	};
}

function detectLocal(config: AgentConfig): NodeCapabilities {
	return {
		backend: "local",
		// 配置里那个 chrome bin 也要当一条报上去：运维显式指定过的路径，
		// 比我们按标准路径猜出来的更该出现在清单里。
		browsers: detectLocalBrowsers({ chromeBin: config.local.chromeBin }),
		detectedAtEpochSec: nowEpochSec(),
	};
}

export function createCapabilityDetector(
	config: AgentConfig
): CapabilityDetector {
	return (backend) =>
		backend === "docker"
			? detectDocker(config)
			: Promise.resolve(detectLocal(config));
}
