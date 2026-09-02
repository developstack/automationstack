import { fetchBrowserWebSocketUrl } from "./cdp-browser-endpoint";
import { connectCdp } from "./cdp-connection";
import { createRecorderClock } from "./normalize";
import type { RecorderRuntime, RecorderState } from "./recorder-session";
import {
	AUTO_ATTACH_PARAMS,
	captureJpegBase64,
	handleEvent,
	reportDetached,
} from "./recorder-session";
import { createScreenshotCapturer } from "./screenshot";
import { createRecorderSink } from "./sink";
import type { StartRecorder } from "./types";

/**
 * recorder 的挂载与事件搬运（plan §5.5「挂载与时序」）。
 *
 * 这条是**第二条** CDP 连接：CDP 允许多客户端，所以它与 chromedriver /
 * Playwright 的那条并存、互不干扰。它只做三件事——把命令发出去、把事件交给
 * 归一化层、把结果丢给 sink，不维护任何浏览器状态。
 *
 * 时序上的硬要求（plan §5.5）：调用方必须**先 await 本函数、再放行客户端**
 * （WebDriver 是返回 create-session 响应，CDP 是接通客户端管道），否则脚本的
 * 第一个导航会漏录。
 *
 * 故障语义（plan §5.5「故障语义」）：观测挂了不影响执行。所以
 * - 初次挂载失败**不抛**，返回一个空转的 handle 并通过 onDetached 报告；
 * - 运行期断开重连一次，仍失败才 onDetached（调用方据此记 recorder_detached）。
 *
 * 这里只留「连接的生命周期」：建连、断线重连、以及对外的 startRecorder。
 * 原文件 435 行、越过了仓库 300 行的上限（scripts/check-file-rules.js），
 * 连上之后的搬运（状态、附着 target、事件分流、截图取帧）拆去了
 * `recorder-session.ts`，事件白名单拆去了 `recorder-cdp-events.ts`，
 * 问 WS 地址拆去了 `cdp-browser-endpoint.ts`。
 */

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const connect = async (runtime: RecorderRuntime): Promise<void> => {
	const wsUrl = await fetchBrowserWebSocketUrl(runtime.opts.cdpHttpEndpoint);
	const next = await connectCdp(wsUrl, {
		onClose: (reason) => handleClose(runtime, reason),
		onEvent: (event) => handleEvent(runtime, event),
	});
	runtime.state.connection = next;
	if (runtime.state.stopped) {
		// stop() 与（重）连接赛跑：会话已经收尾了就别把连接留着。
		next.close();
		runtime.state.connection = null;
		return;
	}
	// browser 级下发：现存的与之后新开的 target 都会自动附着并回 attachedToTarget。
	await next.send("Target.setAutoAttach", { ...AUTO_ATTACH_PARAMS });
};

// 函数声明而非 const：与 connect 互相引用，靠提升解掉这个环。
function handleClose(runtime: RecorderRuntime, reason: string): void {
	const { state } = runtime;
	if (state.stopped) {
		return;
	}
	state.connection = null;
	// 重连后 sessionId 全部作废，映射必须清掉，否则会把旧 sessionId 认成新 target。
	state.sessionTargets.clear();
	state.lastPageSessionId = null;
	if (state.reconnectUsed) {
		reportDetached(runtime, `recorder_detached: ${reason}`);
		return;
	}
	state.reconnectUsed = true;
	connect(runtime).catch((error) => {
		reportDetached(
			runtime,
			`recorder_detached: reconnect failed (${describeError(error)})`
		);
	});
}

/**
 * 初次挂载同样吃那一次重连预算：容器刚 ready 时 /json/version 偶尔还没起来，
 * 隔一拍再试一次就好；两次都不成才认输。
 */
const attachWithRetry = async (runtime: RecorderRuntime): Promise<void> => {
	try {
		await connect(runtime);
	} catch {
		runtime.state.reconnectUsed = true;
		try {
			await connect(runtime);
		} catch (retryError) {
			// 挂载彻底失败也**返回 handle 而不抛**：观测挂了不影响执行。
			// setTimeout 而不是直接调：让调用方先拿到 handle，再收到失败通知。
			setTimeout(() => {
				reportDetached(
					runtime,
					`recorder_detached: attach failed (${describeError(retryError)})`
				);
			}, 0);
		}
	}
};

export const startRecorder: StartRecorder = async (opts) => {
	const clock = createRecorderClock();
	const sink = createRecorderSink(opts.workDir);
	const state: RecorderState = {
		connection: null,
		detachReported: false,
		lastPageSessionId: null,
		reconnectUsed: false,
		sessionTargets: new Map(),
		stopped: false,
	};
	const screenshots = createScreenshotCapturer({
		captureJpegBase64: () => captureJpegBase64(state),
		sink,
		workDir: opts.workDir,
	});
	const runtime: RecorderRuntime = { clock, opts, screenshots, sink, state };

	await attachWithRetry(runtime);

	return {
		async captureScreenshot(label) {
			await screenshots.capture(label);
		},
		async stop() {
			if (state.stopped) {
				return;
			}
			state.stopped = true;
			state.connection?.close();
			state.connection = null;
			await sink.close();
		},
	};
};
