/**
 * CDP 方法名 → 对应的归一化函数（订阅面的白名单本体）。
 *
 * 从 `client.ts` 拆出来：那份文件到了 435 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这张 switch 就是
 * 「哪些事件会落盘」的完整清单：v1 要加一类事件，改的只有这一个文件；而它
 * 与连接、重连、截图这些有状态的搬运逻辑没有任何交集。
 */

import { asParams } from "./cdp-param-readers";
import type {
	CdpConsoleApiCalledParams,
	CdpExceptionThrownParams,
	CdpFrameNavigatedParams,
	CdpLoadingFailedParams,
	CdpLoadingFinishedParams,
	CdpLogEntryAddedParams,
	CdpRequestWillBeSentParams,
	CdpResponseReceivedParams,
	NormalizeContext,
	RecorderEvent,
} from "./normalize";
import {
	normalizeConsoleApiCalled,
	normalizeExceptionThrown,
	normalizeFrameNavigated,
	normalizeLoadingFailed,
	normalizeLoadingFinished,
	normalizeLogEntryAdded,
	normalizeRequestWillBeSent,
	normalizeResponseReceived,
	RECORDER_EVENT_TYPE,
} from "./normalize";

export const normalizeCdpEvent = (
	method: string,
	params: Record<string, unknown>,
	ctx: NormalizeContext
): RecorderEvent | null => {
	switch (method) {
		case RECORDER_EVENT_TYPE.requestWillBeSent:
			return normalizeRequestWillBeSent(
				asParams<CdpRequestWillBeSentParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.responseReceived:
			return normalizeResponseReceived(
				asParams<CdpResponseReceivedParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.loadingFinished:
			return normalizeLoadingFinished(
				asParams<CdpLoadingFinishedParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.loadingFailed:
			return normalizeLoadingFailed(
				asParams<CdpLoadingFailedParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.consoleApiCalled:
			return normalizeConsoleApiCalled(
				asParams<CdpConsoleApiCalledParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.exceptionThrown:
			return normalizeExceptionThrown(
				asParams<CdpExceptionThrownParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.logEntryAdded:
			return normalizeLogEntryAdded(
				asParams<CdpLogEntryAddedParams>(params),
				ctx
			);
		case RECORDER_EVENT_TYPE.frameNavigated:
			return normalizeFrameNavigated(
				asParams<CdpFrameNavigatedParams>(params),
				ctx
			);
		// 其余事件（*ExtraInfo、Target.*、DOM.* …）v1 不订阅也不落盘。
		default:
			return null;
	}
};
