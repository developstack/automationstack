import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";
import { WebSocket } from "ws";

import { reconnectDelayMs } from "./backoff";
import type { CapabilityDetector } from "./capabilities";
import type { AgentLogger } from "./logger";
import type { ProviderFactory } from "./provider-factory";
import { runSession, type SessionDeps } from "./session";

/**
 * 重连循环：把「一次连接」（`session.ts`）串成「一直在线」。
 *
 * 这里只做三件事——判断该不该再试、等多久、以及把停止信号透下去。
 * 槽位、RPC、隧道一概不认识。
 */

/**
 * 心跳间隔。**与 `packages/api/src/lib/farm-node-online.ts` 的
 * `NODE_HEARTBEAT_INTERVAL_MS` 是同一个约定的两份副本**：平台按
 * `30s × 3 = 90s` 的窗口判离线（容三拍，丢一拍不慌）。
 * 把这里调大而不动那边，直接后果是节点在好好干活的时候被画成离线。
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** 正常退出。 */
const EXIT_OK = 0;
/** 不可重试的失败（凭据被拒、后端对不上、provider 起不来）。 */
const EXIT_FATAL = 1;

export interface AgentOptions {
	agentVersion: string;
	backends: NodeBackend[];
	/** 启动时探到的能力快照，每次拨号都按原样报（`index.ts` 探一次）。 */
	capabilities: NodeCapabilities;
	connectUrl: string;
	createProvider: ProviderFactory;
	/** 现探现报的探测器，供 `detectCapabilities` RPC。 */
	detectCapabilities: CapabilityDetector;
	/** 默认 `HEARTBEAT_INTERVAL_MS`。用例会调到毫秒级。 */
	heartbeatIntervalMs?: number;
	logger: AgentLogger;
	/** 默认 `new WebSocket(url)`。用例注入自己的拨号器。 */
	openWebSocket?: (url: string) => WebSocket;
	/** 退避抖动的随机源，默认 `Math.random`。 */
	random?: () => number;
	token: string;
}

export interface Agent {
	/** 进程该用的退出码。 */
	done: Promise<number>;
	stop: () => void;
}

/** 可被打断的等待。返回 false = 等待期间收到了停止信号。 */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
	if (signal.aborted) {
		// 已经 abort 过的 signal 不会再派发一次 abort 事件——不先看一眼的话，
		// 「连接刚断、紧接着收到 SIGTERM」这条时序会白等一整拍退避才退出。
		return Promise.resolve(false);
	}
	return new Promise<boolean>((resolve) => {
		const onAbort = (): void => {
			clearTimeout(timer);
			resolve(false);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve(true);
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

async function loop(deps: SessionDeps, random: () => number): Promise<number> {
	const { logger } = deps;
	let attempt = 0;
	for (;;) {
		// biome-ignore lint/performance/noAwaitInLoops: 重连本来就是串行的——这一整个循环的语义就是「一次只连一条」
		const outcome = await runSession(deps);
		if (outcome.kind === "stopped") {
			logger.info("已停止，槽位已全部释放");
			return EXIT_OK;
		}
		if (outcome.kind === "fatal") {
			logger.error(outcome.reason);
			return EXIT_FATAL;
		}
		// 握手成功过就把计数归位：一次跑了三天之后的断线，不该继承三天前那次
		// 启动失败攒下的退避（否则第一拍就直接等满 30 秒）。
		attempt = outcome.connected ? 1 : attempt + 1;
		const delay = reconnectDelayMs(attempt, random);
		logger.warn(`${outcome.reason}，${delay}ms 后重连（第 ${attempt} 次）`);
		const slept = await sleep(delay, deps.signal);
		if (!slept) {
			logger.info("已停止");
			return EXIT_OK;
		}
	}
}

export function startAgent(options: AgentOptions): Agent {
	const controller = new AbortController();
	const deps: SessionDeps = {
		agentVersion: options.agentVersion,
		backends: options.backends,
		capabilities: options.capabilities,
		connectUrl: options.connectUrl,
		createProvider: options.createProvider,
		detectCapabilities: options.detectCapabilities,
		heartbeatIntervalMs: options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS,
		logger: options.logger,
		openWebSocket: options.openWebSocket ?? ((url) => new WebSocket(url)),
		signal: controller.signal,
		token: options.token,
	};
	return {
		done: loop(deps, options.random ?? Math.random),
		stop: () => {
			controller.abort();
		},
	};
}
