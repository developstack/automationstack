/**
 * `Runtime.*` 与 `Log.*` 事件的归一化：控制台、未捕获异常、浏览器日志。
 *
 * 从 `normalize.ts` 拆出来：那份文件到了 403 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这几类事件共用
 * 同一组取舍——时间戳已经是 epoch ms（不经时钟换算），而体积风险来自
 * RemoteObject 与调用栈，所以「不递归展开对象」「console 只留栈顶帧、异常留
 * 完整栈」这两条规则和它们的实现放在一起才看得见对照。
 */

import type {
	CdpCallFrame,
	CdpConsoleApiCalledParams,
	CdpExceptionThrownParams,
	CdpLogEntryAddedParams,
	CdpRemoteObject,
	NormalizeContext,
	RecorderEvent,
} from "./normalize-types";
import { RECORDER_EVENT_TYPE } from "./normalize-types";

/**
 * RemoteObject → 一个可落盘的标量。
 *
 * **不递归**：拿到对象引用时不去 `Runtime.getProperties` 展开对象图——那要额外
 * 往返、可能拉出兆级数据，而且页面一跳引用就失效了。`description` 已经是
 * DevTools 控制台折叠状态显示的那一行摘要，排查足够。
 */
const normalizeRemoteObject = (arg: CdpRemoteObject): unknown => {
	if (arg.value !== undefined) {
		return arg.value;
	}
	if (arg.description !== undefined) {
		return arg.description;
	}
	return arg.type;
};

const normalizeCallFrame = (frame: CdpCallFrame) => ({
	function: frame.functionName ?? "",
	line: frame.lineNumber ?? -1,
	url: frame.url ?? "",
});

export const normalizeConsoleApiCalled = (
	params: CdpConsoleApiCalledParams,
	ctx: NormalizeContext
): RecorderEvent => {
	const topFrame = params.stackTrace?.callFrames?.[0];

	return {
		data: {
			args: (params.args ?? []).map(normalizeRemoteObject),
			// 只留栈顶帧：console 一条一栈，完整栈的价值远不如它占的体积。
			frame: topFrame
				? { line: topFrame.lineNumber ?? -1, url: topFrame.url ?? "" }
				: null,
			level: params.type,
			timestamp: params.timestamp,
		},
		targetId: ctx.targetId,
		// Runtime.* 的 timestamp 已经是 epoch ms，不用换算。
		ts: params.timestamp,
		type: RECORDER_EVENT_TYPE.consoleApiCalled,
	};
};

export const normalizeExceptionThrown = (
	params: CdpExceptionThrownParams,
	ctx: NormalizeContext
): RecorderEvent => {
	const details = params.exceptionDetails;

	return {
		data: {
			description: details?.exception?.description ?? "",
			// 未捕获异常留完整栈：定位问题就靠它，而异常数量天然有限。
			frames: (details?.stackTrace?.callFrames ?? []).map(normalizeCallFrame),
			text: details?.text ?? "",
			timestamp: params.timestamp,
		},
		targetId: ctx.targetId,
		ts: params.timestamp,
		type: RECORDER_EVENT_TYPE.exceptionThrown,
	};
};

export const normalizeLogEntryAdded = (
	params: CdpLogEntryAddedParams,
	ctx: NormalizeContext
): RecorderEvent => ({
	data: {
		level: params.entry.level,
		source: params.entry.source,
		text: params.entry.text,
		timestamp: params.entry.timestamp,
		url: params.entry.url ?? "",
	},
	targetId: ctx.targetId,
	ts: params.entry.timestamp,
	type: RECORDER_EVENT_TYPE.logEntryAdded,
});
