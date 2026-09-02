/**
 * CDP 事件 → 统一信封的归一化层（plan §5.5）。
 *
 * 这一层全是纯函数：进来一份 CDP 事件参数，出去一个 `RecorderEvent | null`，
 * 不碰 ws、不碰磁盘。两个理由：
 * 1. 本机没有浏览器可挂，真连接跑不起来；把字段裁剪全部收在纯函数里，
 *    单测才能覆盖到（client.ts 只剩「搬运」，出错面小得多）；
 * 2. **字段裁剪就是这一层存在的全部意义**——CDP 原始事件里的 headers、
 *    RemoteObject 可能极大，整包落盘会把会话工作目录撑爆。所以每类事件都
 *    显式挑字段，白名单之外一律丢弃，且只挑 plan §5.5 表格里列的那些。
 *
 * ## 时间轴（这里最容易踩坑的地方）
 *
 * CDP 的「时间戳」有三种互不相同的口径：
 * - `Network.*` 的 `timestamp` 是 MonotonicTime：**秒**，单调时钟，与墙钟无关，
 *   绝对值没有意义（浏览器进程启动以来的读数）；
 * - `Network.requestWillBeSent` 额外带 `wallTime`：epoch **秒**，是全流程里
 *   唯一的墙钟锚点；
 * - `Runtime.*` / `Log.*` 的 timestamp 是 epoch **毫秒**，可以直接用；
 * - `Page.frameNavigated` 干脆不带时间戳。
 *
 * 于是：用第一条 requestWillBeSent 的 (timestamp, wallTime) 标定一次单调时钟
 * 偏移，其余 Network 事件据此换算成 epoch ms；标定之前（比如会话第一条事件是
 * console）回落到「收到事件的时刻」。frameNavigated 同样用收到时刻。
 * 单调时间戳本身仍原样留在 `data.timestamp` 里——HAR 的时长计算要用它做差，
 * 用差值而不是换算后的绝对值，才不会把标定误差算进耗时。
 *
 * ## 文件构成
 *
 * 实现按事件族拆在同目录下（原文件 403 行，越过了仓库 300 行的上限，见
 * scripts/check-file-rules.js）：时钟在 `recorder-clock.ts`，协议与信封类型在
 * `normalize-types.ts`，`Network.*` 在 `normalize-network.ts`，
 * `Runtime.*`/`Log.*` 在 `normalize-runtime.ts`，`Page.frameNavigated` 在
 * `normalize-page.ts`。这里只留上面这段总述与导出面——`./normalize` 这个路径
 * 上原有的导出一个不少，调用方（含跨包的测试）不必跟着改 import。
 */

// biome-ignore lint/performance/noBarrelFile: 这不是「顺手 re-export 一切」的中转文件，而是原文件本身——实现因 300 行上限（scripts/check-file-rules.js）拆去了同目录的 normalize-*.ts / recorder-clock.ts，这里把 `./normalize` 这个路径上原有的导出面原样补回来，调用方（含跨包按相对路径导入的测试）才不用跟着改 import
export {
	normalizeLoadingFailed,
	normalizeLoadingFinished,
	normalizeRequestWillBeSent,
	normalizeResponseReceived,
	POST_DATA_MAX_CHARS,
} from "./normalize-network";
export { normalizeFrameNavigated } from "./normalize-page";
export {
	normalizeConsoleApiCalled,
	normalizeExceptionThrown,
	normalizeLogEntryAdded,
} from "./normalize-runtime";
export type {
	CdpCallFrame,
	CdpConsoleApiCalledParams,
	CdpExceptionThrownParams,
	CdpFrameNavigatedParams,
	CdpLoadingFailedParams,
	CdpLoadingFinishedParams,
	CdpLogEntryAddedParams,
	CdpRemoteObject,
	CdpRequestWillBeSentParams,
	CdpResponseReceivedParams,
	NormalizeContext,
	RecorderEvent,
} from "./normalize-types";
export { RECORDER_EVENT_TYPE } from "./normalize-types";
export type { RecorderClock } from "./recorder-clock";
export { createRecorderClock } from "./recorder-clock";
