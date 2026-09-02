import { mkdir } from "node:fs/promises";
import type {
	AcquiredSlot,
	AcquireSlotInput,
	SlotProvider,
} from "@automationstack/browser-slots";
import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
import type { FarmSessionProtocol } from "@automationstack/db/schema/farm-enums";
import type { NewFarmSession } from "@automationstack/db/schema/farm-sessions";
import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

import type { FarmIdentity } from "./auth";
import { farmConfig } from "./config";
import { finalizeSession, type SessionLifecycleDeps } from "./finalize";
import { waitCdpDebuggerUrl, waitWebDriverReady } from "./launch-readiness";
import {
	buildSessionRow,
	createSessionShell,
	pickBrowser,
} from "./launch-session-shell";
import type { SourceListing, SourceUsage } from "./nodes/source-registry";
import type { StartRecorder } from "./recorder/types";
import type { LiveSession } from "./session";

/**
 * 「把一条会话拉起来」的公共流水线（plan §5.3 / §5.4 的前半段）。
 *
 * WebDriver 与 CDP 两条数据面在**建会话**这件事上几乎完全一样：配额 → 选镜像 →
 * 建库行 → 起容器 → 等上游 ready → 挂 recorder。区别只有最后一步之后：一个去转发
 * create-session，一个去建 WS 管道。把公共的这一段抽出来不是为了少写代码，是为了
 * 让**失败清理**只有一份实现——这条流水线有六个可以失败的位置，每个位置失败时该
 * 放掉什么（槽位、容器、库行、工作目录）都不一样，写两遍必然有一遍漏。
 *
 * 探活轮询搬去了 `launch-readiness.ts`，选镜像/造会话/造库行搬去了
 * `launch-session-shell.ts`（本文件曾到 413 行，越过仓库 300 行上限，
 * 见 scripts/check-file-rules.js）；这里留下的是「顺序」与「失败了放什么」。
 */

const MS_PER_SECOND = 1000;

// 探活函数不再从这里转出：转出一层会让 `launch.ts` 变成一个 barrel
// （lint/performance/noBarrelFile），调用方直接引 `./launch-readiness` 即可。

export interface BrowserCatalogPort {
	findBrowserByNameVersion: (
		browser: string,
		version: string
	) => Promise<FarmBrowser | null>;
	findDefaultBrowser: () => Promise<FarmBrowser | null>;
}

export interface SessionCreatePort {
	createSession: (row: NewFarmSession) => Promise<unknown>;
}

/**
 * 复合槽位来源额外提供的两件事（`nodes/composite-provider.ts` 实现它）。
 *
 * 它们**不在 `SlotProvider` 里**，因为它们只对「有多个源」这件事成立：一个
 * 单一后端既不需要分辨是哪个源在报错，也没有 node_id 可回填。写成一个独立端口
 * 而不是把 `provider` 的类型换成复合类型，是为了让只关心「起一个槽位」的调用方
 * （以及它们的测试替身）继续只面对那三个方法。
 */
export interface SlotSourcePort {
	/** 逐源列举，保留每个源自己的成败。reaper 用它避免把一次 RPC 失败当成容器消失。 */
	listManagedBySource: () => Promise<SourceListing[]>;
	/** 这个槽位跑在哪台实机节点上；null = 内建源。 */
	nodeIdOfContainer: (containerId: string) => string | null;
	/** 现场重探一个节点的能力；null = 它当下不在线（`nodes/capability-refresh.ts`）。 */
	refreshNodeCapabilities: (nodeId: string) => Promise<NodeCapabilities | null>;
	/** 这个槽位属于哪个源（用于把「本轮问不出来」精确地限制在那个源上）。 */
	sourceNameOfContainer: (containerId: string) => string | null;
	/** 各源当下的占用，`/wd/hub/status` 拿它做容量汇总。 */
	usage: () => SourceUsage[];
}

/** 两条数据面共用的依赖包。装配层建一次，注入到两个 proxy 里。 */
export interface FarmDataPlaneDeps extends SessionLifecycleDeps {
	browsers: BrowserCatalogPort;
	provider: SlotProvider;
	sessionRows: SessionCreatePort;
	/** 多源相关的那两件事，见 `SlotSourcePort`。 */
	sources: SlotSourcePort;
	startRecorder: StartRecorder;
}

export interface LaunchSessionInput {
	browserName: string | null;
	browserVersion: string | null;
	deps: FarmDataPlaneDeps;
	identity: FarmIdentity;
	/**
	 * 客户端点名的槽位来源（`as:options.node` / CDP 查询串的 `node`）。
	 * null = 不点名，由复合源按占用率自己挑（`nodes/pick-source.ts`）。
	 */
	nodeHint: string | null;
	protocol: FarmSessionProtocol;
	/** 已剥掉 `as:options` 的 caps，原样入库供详情页展示。CDP 传 null。 */
	requestedCapabilities: unknown;
}

export type LaunchOutcome =
	/** 起不来。库行（若已建）已置终态、容器已放，调用方只需把 message 翻成协议错误。 */
	| { kind: "failed"; message: string }
	/** 配额或关停期拒绝。**没有**建任何库行与容器。 */
	| { kind: "rejected"; message: string; retryAfterSeconds: number }
	| { kind: "ok"; session: LiveSession; slot: AcquiredSlot };

/**
 * 挂 recorder。**失败不阻断会话**（§5.5 故障语义）：观测是附加价值，
 * 一次录制挂不上不该让用户的测试跑不了。只在会话上留一个事实，收尾时再决定要不要
 * 把它写进死因。
 *
 * ## 为什么它不在 `launchSession()` 里，而是由两条数据面各自择时调用
 *
 * 两种协议里「浏览器进程什么时候真正存在」根本不同：
 *
 * - **CDP 模式**：容器 entrypoint 直接起 chromium，探活通过就意味着 9222 已经在
 *   听，可以立刻挂。
 * - **WebDriver 模式**：容器里只有 chromedriver，**浏览器要等 create-session 才被
 *   拉起来**（plan §5.5「关键时序」段）。在转发 create-session 之前挂 recorder，
 *   9222 上根本没有东西在听，必然 ECONNREFUSED——每一条 WebDriver 会话都会是
 *   `recorder_detached`，一份产物都录不到。
 *
 * 所以 WebDriver 的顺序是「转发 create-session → 挂 recorder → **再**把响应交给
 * 客户端」。这不违背「不漏第一个导航」：客户端拿不到 sessionId 就发不出第一条
 * `POST /session/{id}/url`，而 chromedriver 建会话时只开一个 about:blank。
 */
export async function attachRecorder(
	deps: FarmDataPlaneDeps,
	session: LiveSession,
	slot: AcquiredSlot
): Promise<void> {
	try {
		session.recorder = await deps.startRecorder({
			cdpHttpEndpoint: slot.cdpHttpEndpoint,
			onDetached: (reason) => {
				console.warn(`recorder 掉线 session=${session.id} reason=${reason}`);
				session.recorderDetached = true;
			},
			workDir: session.workDir,
		});
	} catch (error) {
		console.warn(`启动 recorder 失败，会话继续 session=${session.id}`, error);
		session.recorderDetached = true;
	}
}

/** 建会话失败的统一出口：走同一条收尾路径置 `failed`，绝不在这里手工放容器。 */
async function abort(
	deps: FarmDataPlaneDeps,
	session: LiveSession,
	message: string,
	reason: string
): Promise<LaunchOutcome> {
	await finalizeSession({ deps, reason, session, status: "failed" });
	return { kind: "failed", message };
}

/**
 * 拼 `acquire` 的入参。
 *
 * `expiresAtEpochSec` 由 farm 算而不是由 provider 算：它要与容器 label / 节点侧
 * 的自杀计时是**同一个绝对时刻**，各算各的就会出现两级超时差着几秒的情况。
 */
function buildAcquireInput(
	input: LaunchSessionInput,
	session: LiveSession
): AcquireSlotInput {
	return {
		// 浏览器**直接从目录行下发**：`browser` / `version` 两列就是真相源，
		// 让节点从镜像 tag 里反解一次是绕远路（协议 `rpc.ts`：节点不再自行猜测）。
		browserName: session.browser,
		browserVersion: session.version,
		expiresAtEpochSec: Math.floor(
			(Date.now() + farmConfig.session.maxLifetimeMs) / MS_PER_SECOND
		),
		image: session.image,
		mode: input.protocol,
		// 点名不中时，复合源抛出的那句话会经 acquireAndWait 的 message 端到客户端。
		nodeHint: input.nodeHint ?? undefined,
		sessionId: session.id,
	};
}

/** 起容器 + 等上游 ready。成功回槽位，失败已经把会话结算掉了。 */
async function acquireAndWait(
	input: LaunchSessionInput,
	session: LiveSession
): Promise<
	| { kind: "failed"; outcome: LaunchOutcome }
	| { kind: "ok"; slot: AcquiredSlot }
> {
	const { deps } = input;
	let slot: AcquiredSlot;
	try {
		slot = await deps.provider.acquire(buildAcquireInput(input, session));
	} catch (error) {
		console.error(`起容器失败 session=${session.id}`, error);
		return {
			kind: "failed",
			outcome: await abort(
				deps,
				session,
				`无法启动浏览器容器：${error instanceof Error ? error.message : String(error)}`,
				"container_start_failed"
			),
		};
	}
	session.slot = slot;
	const endpoint = input.protocol === "webdriver" ? slot.wdEndpoint : null;
	const ready =
		input.protocol === "webdriver"
			? endpoint !== null && (await waitWebDriverReady(endpoint))
			: (await waitCdpDebuggerUrl(slot.cdpHttpEndpoint)) !== null;
	if (!ready) {
		return {
			kind: "failed",
			outcome: await abort(
				deps,
				session,
				"浏览器容器在 30 秒内没有就绪",
				"upstream_not_ready"
			),
		};
	}
	return { kind: "ok", slot };
}

/**
 * 拉起一条会话，直到「容器 ready、recorder 已挂、库行是 running」。
 *
 * 返回之后调用方只剩协议自己的那一半：WebDriver 去转发 create-session，
 * CDP 去建 WS 管道。
 *
 * ## 顺序上有两件事不能换
 *
 * 1. **目录查询在 `admit()` 之前**。`admit()` 与 `register()` 之间的窗口越短越好
 *    （`scheduler.ts` 里写了为什么接受这个窗口），所以中间不能夹一次数据库往返。
 * 2. **recorder 在返回之前挂**。WebDriver 那边的 create-session 转发一旦发出去，
 *    浏览器就可能立刻开始导航——recorder 晚挂一步，第一个页面的网络事件就永久
 *    丢了，而那恰恰是最想看的那一段（D5）。
 */
export async function launchSession(
	input: LaunchSessionInput
): Promise<LaunchOutcome> {
	const { deps } = input;
	const picked = await pickBrowser(
		deps,
		input.browserName,
		input.browserVersion
	);
	if (picked.kind === "error") {
		return { kind: "failed", message: picked.message };
	}
	const decision = deps.registry.admit();
	if (decision.kind === "rejected") {
		return {
			kind: "rejected",
			message: decision.message,
			retryAfterSeconds: decision.retryAfterSeconds,
		};
	}
	const session = createSessionShell(input, picked.row);
	// 同步入表，把超配窗口压到这一行之内。
	deps.registry.register(session);

	await mkdir(session.workDir, { recursive: true });
	try {
		await deps.sessionRows.createSession(
			buildSessionRow(input, session, picked.row)
		);
	} catch (error) {
		console.error(`写入会话行失败 session=${session.id}`, error);
		deps.registry.remove(session.id);
		return { kind: "failed", message: "无法登记会话，请稍后重试" };
	}

	const acquired = await acquireAndWait(input, session);
	if (acquired.kind === "failed") {
		return acquired.outcome;
	}
	session.markRunning();
	await deps.sessions.updateSessionStatus(session.id, {
		containerId: acquired.slot.containerId,
		// 跑在哪台机器上要等 acquire 回来才知道，所以是**回填**而不是建行时就写。
		// 搭这一次已经要发的状态写入的顺风车，不多花一次往返。
		nodeId: deps.sources.nodeIdOfContainer(acquired.slot.containerId),
		startedAt: new Date(),
		status: "running",
	});
	return { kind: "ok", session, slot: acquired.slot };
}
