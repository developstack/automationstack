/**
 * recorder 的可变状态，以及「连上之后」的全部搬运：附着 target、分流事件、
 * 截图取帧、报告脱离。
 *
 * 从 `client.ts` 拆出来：那份文件到了 435 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这些函数共用同一
 * 个把手（`RecorderState` / `RecorderRuntime`）、也共用同一条故障语义——观测
 * 动作失败一律吞掉，不影响会话；而建连、重连、以及对外的 `startRecorder`
 * 是「连接生命周期」那一层，留在 `client.ts`。
 */

import type { CdpConnection, CdpEvent } from "./cdp-connection";
import { isRecord, readString } from "./cdp-param-readers";
import type { RecorderClock, RecorderEvent } from "./normalize";
import { RECORDER_EVENT_TYPE } from "./normalize";
import { normalizeCdpEvent } from "./recorder-cdp-events";
import type { ScreenshotCapturer } from "./screenshot";
import { SCREENSHOT_QUALITY } from "./screenshot";
import type { RecorderSink } from "./sink";
import type { StartRecorderOptions } from "./types";

/** waitForDebuggerOnStart 必须是 false：我们是旁观者，不能把新 target 卡在断点上。 */
export const AUTO_ATTACH_PARAMS = {
	autoAttach: true,
	flatten: true,
	waitForDebuggerOnStart: false,
} as const;

/** 只录这三类 target；browser / other 之类没有页面语义，enable 也没意义。 */
const RECORDED_TARGET_TYPES: ReadonlySet<string> = new Set([
	"page",
	"iframe",
	"worker",
]);

const DOMAINS_TO_ENABLE = [
	"Network.enable",
	"Runtime.enable",
	"Page.enable",
	"Log.enable",
] as const;

const ignoreRejection = (): void => {
	/* 挂载/截图这类观测动作失败不影响会话，这里统一吞掉 */
};

/**
 * recorder 的全部可变状态。之所以抽成一个对象而不是留在 startRecorder 的闭包
 * 里：搬运逻辑（附着 target、分流事件、断线重连）要被提到模块级才不至于挤成
 * 一个几百行的函数，而闭包变量没法跨函数共享——只能显式传这一个把手。
 */
export interface RecorderState {
	connection: CdpConnection | null;
	detachReported: boolean;
	/** 截图命令必须发给某个 page session，挑最近导航的那个。 */
	lastPageSessionId: string | null;
	/** 整个 recorder 生命周期只有一次重连预算（plan §5.5）。 */
	reconnectUsed: boolean;
	/** sessionId → targetId：扁平协议下事件只带 sessionId，落盘要的是 targetId。 */
	sessionTargets: Map<string, string>;
	stopped: boolean;
}

/** 状态 + 那几个一经创建就不再变的协作者。 */
export interface RecorderRuntime {
	clock: RecorderClock;
	opts: StartRecorderOptions;
	screenshots: ScreenshotCapturer;
	sink: RecorderSink;
	state: RecorderState;
}

/** 向「最近导航的那个 page session」发 Page.captureScreenshot，返回 base64；拿不到返回 null。 */
export const captureJpegBase64 = async (
	state: RecorderState
): Promise<string | null> => {
	const active = state.connection;
	const sessionId = state.lastPageSessionId;
	if (!(active && sessionId)) {
		return null;
	}
	const result = await active.send(
		"Page.captureScreenshot",
		{ format: "jpeg", quality: SCREENSHOT_QUALITY },
		sessionId
	);
	return typeof result.data === "string" ? result.data : null;
};

/** 只报一次：重连失败与初次挂载失败可能先后落到这里，调用方不该收两遍。 */
export const reportDetached = (
	runtime: RecorderRuntime,
	reason: string
): void => {
	if (runtime.state.stopped) {
		// 已经 stop 过：这次断开是**我们主动停的**结果，不是故障。
		//
		// 这道闸门不能只放在 handleClose 的入口——重连是异步的，会话收尾时完全可能
		// 有一次重连正在飞（浏览器先退出 → close → 重连 → 我们 stop → 重连失败）。
		// 只在入口拦，那次在飞的重连仍会把 `recorder_detached` 报上来，于是每条正常
		// 结束的会话都带一个假死因，这个字段就再也分不出真掉线。判据放在**上报的
		// 那一刻**才拦得住它。
		return;
	}
	if (runtime.state.detachReported) {
		return;
	}
	runtime.state.detachReported = true;
	try {
		runtime.opts.onDetached?.(reason);
	} catch {
		// 调用方的回调抛异常不该反过来影响 recorder。
	}
};

const sendQuietly = async (
	state: RecorderState,
	method: string,
	params?: Record<string, unknown>,
	sessionId?: string
): Promise<void> => {
	const active = state.connection;
	if (!active) {
		return;
	}
	try {
		await active.send(method, params, sessionId);
	} catch {
		// 比如 worker target 不支持 Page 域：单个域 enable 失败不该中断整次挂载。
	}
};

const attachSession = async (
	state: RecorderState,
	params: Record<string, unknown>
): Promise<void> => {
	const sessionId = readString(params, "sessionId");
	const targetInfo = isRecord(params.targetInfo) ? params.targetInfo : null;
	const targetId = targetInfo ? readString(targetInfo, "targetId") : undefined;
	const type = targetInfo ? readString(targetInfo, "type") : undefined;
	if (!(sessionId && targetId && type && RECORDED_TARGET_TYPES.has(type))) {
		return;
	}
	state.sessionTargets.set(sessionId, targetId);
	if (type === "page" && !state.lastPageSessionId) {
		state.lastPageSessionId = sessionId;
	}
	await Promise.all(
		DOMAINS_TO_ENABLE.map((method) =>
			sendQuietly(state, method, undefined, sessionId)
		)
	);
	// 在 page session 上再下发一次：跨进程 iframe / worker 是挂在 page 下面的，
	// browser 级的 autoAttach 够不到它们。
	await sendQuietly(
		state,
		"Target.setAutoAttach",
		{ ...AUTO_ATTACH_PARAMS },
		sessionId
	);
};

/**
 * target 生命周期事件：附着上就 enable 四个域，脱离就把映射清掉。
 * 返回 true 表示这条事件已经被处理，不该再进归一化。
 */
const handleTargetEvent = (state: RecorderState, event: CdpEvent): boolean => {
	if (event.method === "Target.attachedToTarget") {
		attachSession(state, event.params).catch(ignoreRejection);
		return true;
	}
	if (event.method !== "Target.detachedFromTarget") {
		return false;
	}
	const sessionId = readString(event.params, "sessionId");
	if (sessionId) {
		state.sessionTargets.delete(sessionId);
		if (state.lastPageSessionId === sessionId) {
			state.lastPageSessionId = null;
		}
	}
	return true;
};

/** 主 frame 导航：既是截图触发点，也把截图的目标 session 换成最新的这个。 */
const onFrameNavigated = (
	runtime: RecorderRuntime,
	event: CdpEvent,
	recorded: RecorderEvent
): void => {
	if (event.sessionId) {
		runtime.state.lastPageSessionId = event.sessionId;
	}
	runtime.screenshots
		.onNavigation(String(recorded.data.url ?? ""))
		.catch(ignoreRejection);
};

export const handleEvent = (
	runtime: RecorderRuntime,
	event: CdpEvent
): void => {
	const { state } = runtime;
	if (handleTargetEvent(state, event)) {
		return;
	}
	const targetId = event.sessionId
		? (state.sessionTargets.get(event.sessionId) ?? event.sessionId)
		: "browser";
	const recorded = normalizeCdpEvent(event.method, event.params, {
		clock: runtime.clock,
		targetId,
	});
	if (!recorded) {
		return;
	}
	runtime.sink.write(recorded);
	if (recorded.type !== RECORDER_EVENT_TYPE.frameNavigated) {
		return;
	}
	onFrameNavigated(runtime, event, recorded);
};
