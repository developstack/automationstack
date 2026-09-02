import type { AcquiredSlot } from "@automationstack/browser-slots";
import type { FarmSessionProtocol } from "@automationstack/db/schema/farm-enums";

import type { RecorderHandle } from "./recorder/types";

/**
 * 一条活着的会话在 farm 内存里的样子（plan §5.2）。
 *
 * **这里是会话的真相**，`farm_sessions` 那张表只是它的审计投影（D6）。所以这个
 * 文件不 import 任何 db 运行时、不 import config、不 import finalize——它只管
 * 「状态怎么迁、计时器什么时候响」，于是状态机能被单测逐条钉死，而它的失效方式
 * （超时没触发、touch 没重置、收尾被走了两遍）在真容器上极难复现。
 *
 * ## 为什么超时不直接调 finalize
 *
 * 那会造成 `session.ts ↔ finalize.ts` 的模块循环，更要紧的是它会让「谁来收尾」
 * 这件事有两个入口。这里只回调 `onExpired`，由装配层（`index.ts`）决定它走哪条
 * 收尾路径——reaper 与正常路径也走同一条。
 *
 * ## 幂等的那道闸门
 *
 * `beginFinishing()` 是**内存这一侧**的幂等保证：先到者返回 true 并把状态推进
 * `finishing`，之后所有人拿到 false。库那一侧还有一道（`updateSessionStatus` 的
 * 终态守卫返回 `settled`）。两道都要有：内存那道防的是同一个进程里两个触发源
 * （超时 + 客户端 DELETE）撞车，库那道防的是进程重启后 reaper 与残留写入撞车。
 */

export type LiveSessionState = "finishing" | "running" | "settled" | "starting";

/** 计时器触发的两种死因，取值与 `farm_sessions.status_reason` 的约定一致。 */
export type SessionExpiryReason = "idle_timeout" | "max_lifetime";

export interface LiveSessionInit {
	browser: string;
	id: string;
	/**
	 * 空闲超时；**null = 不设**。CDP 会话就是 null：那条路径以 WS 存活为准，
	 * 一条开着的 WS 上多久没有帧根本不代表会话空闲（客户端可能正在本地算东西）。
	 */
	idleTimeoutMs: number | null;
	image: string;
	maxLifetimeMs: number;
	/** 计时器到点时的回调。装配层把它接到收尾流程上。 */
	onExpired: (session: LiveSession, reason: SessionExpiryReason) => void;
	projectId: string;
	protocol: FarmSessionProtocol;
	version: string;
	/** 本会话专属的落盘目录，recorder 与产物组装都在它下面。 */
	workDir: string;
}

export interface LiveSession {
	/**
	 * 追加一条死因。**不覆盖已有的**，按出现顺序用逗号拼接——一条会话完全可能
	 * 既 `recorder_detached` 又 `artifacts_upload_failed`，只留最后一条就把前一条
	 * 的排查线索丢了。重复追加同一条会被忽略。
	 */
	addStatusReason: (reason: string) => void;
	/** 抢收尾权。先到者 true 并停掉全部计时器；之后一律 false。 */
	beginFinishing: () => boolean;
	readonly browser: string;
	readonly id: string;
	readonly image: string;
	markRunning: () => void;
	readonly projectId: string;
	readonly protocol: FarmSessionProtocol;

	/** recorder 句柄；startRecorder 失败时为 null，会话照常跑（§5.5 故障语义）。 */
	recorder: RecorderHandle | null;
	/**
	 * 观测是否掉线（startRecorder 失败，或 recorder 重连一次仍失败）。
	 *
	 * 刻意**不是**直接调 `addStatusReason`：约定是「没有别的死因时才把
	 * `recorder_detached` 记进去」。一条因为空闲超时而死的会话，人要看的死因是
	 * `idle_timeout`；观测掉没掉线是第二位的信息，混进去只会让按 reason 分组的
	 * 统计多出一堆复合值。所以这里先留一个事实，收尾时再决定要不要写。
	 */
	recorderDetached: boolean;
	/** 收尾截图是否已经截过。DELETE 路径会先截一张，finalize 不该再截第二张。 */
	screenshotCaptured: boolean;
	/** 落定：状态推到 `settled`，计时器彻底停掉。 */
	settle: () => void;
	slot: AcquiredSlot | null;
	state: () => LiveSessionState;
	statusReason: () => string | null;
	/** 重置空闲计时器。WebDriver 每次成功转发调一次。 */
	touch: () => void;
	/** 上游 chromedriver 给的 sessionId。CDP 会话恒为 null。 */
	upstreamSessionId: string | null;
	readonly version: string;
	readonly workDir: string;
}

/**
 * 计时器一律 `unref()`。
 *
 * 没有它，一条 30 分钟寿命的会话会让 Node 事件循环整整 30 分钟不肯退出——
 * 优雅关停走完了、HTTP 监听关掉了，进程还挂在那儿等一个再也不需要的计时器。
 */
function scheduleUnref(callback: () => void, delayMs: number): NodeJS.Timeout {
	return setTimeout(callback, delayMs).unref();
}

/**
 * 会话的可变内部状态。
 *
 * 拎成一个显式对象（而不是闭包里的四个 let）是为了让 `createLiveSession` 能拆成
 * 几个短函数：状态与计时器要被其中每一个读写，而闭包变量跨不出函数边界。
 */
interface SessionInternals {
	idleTimer: NodeJS.Timeout | null;
	lifetimeTimer: NodeJS.Timeout | null;
	reasons: string[];
	state: LiveSessionState;
}

function clearTimers(internals: SessionInternals): void {
	if (internals.idleTimer !== null) {
		clearTimeout(internals.idleTimer);
		internals.idleTimer = null;
	}
	if (internals.lifetimeTimer !== null) {
		clearTimeout(internals.lifetimeTimer);
		internals.lifetimeTimer = null;
	}
}

function isFinished(internals: SessionInternals): boolean {
	return internals.state === "finishing" || internals.state === "settled";
}

/**
 * 只读的身份字段。单拎出来纯粹是为了让 `buildSession` 短到能被人一眼看完——
 * 它剩下的每一行都是状态迁移逻辑，值得单独盯。
 */
function identityFields(
	init: LiveSessionInit
): Pick<
	LiveSession,
	"browser" | "id" | "image" | "projectId" | "protocol" | "version" | "workDir"
> {
	return {
		browser: init.browser,
		id: init.id,
		image: init.image,
		projectId: init.projectId,
		protocol: init.protocol,
		version: init.version,
		workDir: init.workDir,
	};
}

function buildSession(
	init: LiveSessionInit,
	internals: SessionInternals,
	resetIdleTimer: () => void
): LiveSession {
	return {
		...identityFields(init),
		addStatusReason: (reason) => {
			if (!internals.reasons.includes(reason)) {
				internals.reasons.push(reason);
			}
		},
		beginFinishing: () => {
			if (isFinished(internals)) {
				return false;
			}
			internals.state = "finishing";
			clearTimers(internals);
			return true;
		},
		markRunning: () => {
			// 只从 starting 走到 running。收尾期间上游还回了一条响应（DELETE 与
			// 最后一条命令并发）时，这里必须是空操作，否则会话会从 finishing 倒退。
			if (internals.state !== "starting") {
				return;
			}
			internals.state = "running";
			resetIdleTimer();
		},
		recorder: null,
		recorderDetached: false,
		screenshotCaptured: false,
		settle: () => {
			internals.state = "settled";
			clearTimers(internals);
		},
		slot: null,
		state: () => internals.state,
		statusReason: () =>
			internals.reasons.length === 0 ? null : internals.reasons.join(","),
		touch: () => {
			if (internals.state === "running") {
				resetIdleTimer();
			}
		},
		upstreamSessionId: null,
	};
}

export function createLiveSession(init: LiveSessionInit): LiveSession {
	const internals: SessionInternals = {
		idleTimer: null,
		lifetimeTimer: null,
		reasons: [],
		state: "starting",
	};
	// 计时器回调要拿到 session 本身，而 session 的方法又要能重置计时器——
	// 两者互相引用，用一个 holder 打破这个循环（比在对象建好之后再补丁式地
	// 往里塞回调清晰）。
	const holder: { session: LiveSession | null } = { session: null };

	const expire = (reason: SessionExpiryReason): void => {
		// 计时器只在 starting / running 期间有意义；收尾已经开始了就不再打扰它。
		if (holder.session === null || isFinished(internals)) {
			return;
		}
		init.onExpired(holder.session, reason);
	};

	const resetIdleTimer = (): void => {
		if (init.idleTimeoutMs === null) {
			return;
		}
		if (internals.idleTimer !== null) {
			clearTimeout(internals.idleTimer);
		}
		internals.idleTimer = scheduleUnref(
			() => expire("idle_timeout"),
			init.idleTimeoutMs
		);
	};

	holder.session = buildSession(init, internals, resetIdleTimer);
	/**
	 * 寿命计时器从**建会话那一刻**起算，不等 `markRunning()`。
	 *
	 * 一条卡在 `starting` 的会话（镜像拉不动、容器起不来、上游探活一直不 ready）
	 * 同样占着并发槽位，而它恰恰是最需要被自动收掉的那种——数据面的 30s 探活上限
	 * 只覆盖「我们还在等」的那一段，`starting` 期间任何一次 await 挂死都绕过它。
	 */
	internals.lifetimeTimer = scheduleUnref(
		() => expire("max_lifetime"),
		init.maxLifetimeMs
	);
	return holder.session;
}
