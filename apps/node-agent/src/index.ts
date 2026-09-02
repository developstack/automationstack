import { nodeAgentEnv } from "@automationstack/env/node-agent";
import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";

import packageJson from "../package.json" with { type: "json" };
import { startAgent } from "./agent";
import { createDockerProbe, detectBackends } from "./backends";
import { createCapabilityDetector, preferredBackend } from "./capabilities";
import { sweepLocalSlots } from "./cleanup";
import { configFromEnv } from "./config";
import { createConsoleLogger, describeError } from "./logger";
import { createProviderFactory } from "./provider-factory";

/**
 * 实机节点守护进程的入口（plan §12 D14）。
 *
 * 这个进程的全部形态可以用一句话说完：**把 `@automationstack/browser-slots` 的
 * provider 装进一个出站 WS 壳**。它不监听任何端口——节点在 NAT / 办公网里，
 * 零入站是这条设计的前提，也是它比 ssh / docker-tcp 那两条老路强的唯一理由。
 *
 * 启动顺序是有约束的，别重排：
 *
 * 1. **先探能力**：hello 要如实上报 `backends` 与 `capabilities`，探不到就不报
 *    （`backends.ts` / `capabilities.ts`）。本机浏览器清单还要接着喂给 provider
 *    工厂——farm 下发的 `browserName` 要在这份清单里兑现成一个二进制。
 * 2. **再无条件清扫**：旧 agent 一死隧道必死，本机存量槽位按定义全是孤儿
 *    （`cleanup.ts` 的文件头）。清扫要在拨号**之前**——拨完号 farm 随时可能
 *    下发 acquire，那时再扫就会把刚建出来的新槽位一起当孤儿清掉。
 * 3. **最后才拨号**。
 */

const logger = createConsoleLogger();

/** 启动日志里那一行。不可用的也要念出来——「为什么我的 Safari 没被用上」是常见提问。 */
function describeBrowsers(browsers: readonly BrowserCapability[]): string {
	if (browsers.length === 0) {
		return "（一个都没探到）";
	}
	return browsers
		.map((entry) => {
			const version = entry.version ?? "未知版本";
			return entry.available
				? `${entry.name} ${version}`
				: `${entry.name}（不可用：${entry.reason ?? "原因未知"}）`;
		})
		.join("、");
}

/** 第二次信号 = 「别等了」，与 apps/farm、apps/server 同一约定。 */
const EXIT_IMPATIENT = 1;

async function main(): Promise<number> {
	const config = configFromEnv(nodeAgentEnv);
	logger.info(
		`node-agent ${packageJson.version} 启动，平台入口 ${config.connectUrl}`
	);
	const backends = await detectBackends(createDockerProbe(config.docker.host));
	logger.info(`本机可用后端：${backends.join("、")}`);
	const detectCapabilities = createCapabilityDetector(config);
	// local 那份**总要探**（一次同步的路径检查，代价可以忽略）：即使 hello 里报的
	// 是 docker，provider 工厂也要靠它把「farm 点名的浏览器」兑现成本机二进制。
	const local = await detectCapabilities("local");
	const createProvider = createProviderFactory(config, local.browsers);
	await sweepLocalSlots({ backends, createProvider, logger });

	const backend = preferredBackend(backends);
	const capabilities =
		backend === "local" ? local : await detectCapabilities(backend);
	logger.info(
		`本机可用浏览器（${backend}）：${describeBrowsers(capabilities.browsers)}`
	);
	const agent = startAgent({
		agentVersion: packageJson.version,
		backends,
		capabilities,
		connectUrl: config.connectUrl,
		createProvider,
		detectCapabilities,
		logger,
		token: config.token,
	});
	let stopping = false;
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => {
			if (stopping) {
				process.exit(EXIT_IMPATIENT);
			}
			stopping = true;
			logger.info(`收到 ${signal}，正在释放槽位并退出…`);
			agent.stop();
		});
	}
	return await agent.done;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		logger.error("node-agent 启动失败", describeError(error));
		process.exitCode = EXIT_IMPATIENT;
	});
