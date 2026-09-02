/**
 * 归一化层的两组类型：进去的 CDP 事件参数、出来的落盘信封。
 *
 * 从 `normalize.ts` 拆出来：那份文件到了 403 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这些 `Cdp*Params`
 * 是**协议形状的抄写**（改动的理由只有「CDP 变了」），而 normalize* 是我们自己
 * 的取字段策略（改动的理由是「排查时想看什么」）——两者变化的原因不同，分开放
 * 才不会每次调策略都在几十行接口里翻找。
 */

import type { RecorderClock } from "./recorder-clock";

/** 事件信封里的 `type`，直接用 CDP 方法名——自解释，省一张映射表。 */
export const RECORDER_EVENT_TYPE = {
	consoleApiCalled: "Runtime.consoleAPICalled",
	exceptionThrown: "Runtime.exceptionThrown",
	frameNavigated: "Page.frameNavigated",
	loadingFailed: "Network.loadingFailed",
	loadingFinished: "Network.loadingFinished",
	logEntryAdded: "Log.entryAdded",
	requestWillBeSent: "Network.requestWillBeSent",
	responseReceived: "Network.responseReceived",
	/** 唯一一个非 CDP 事件：截图落盘后补进事件流的索引行。 */
	screenshot: "screenshot",
} as const;

/** 落盘的统一信封。`data` 故意保持宽类型：它过一趟磁盘，读回来什么都可能。 */
export interface RecorderEvent {
	data: Record<string, unknown>;
	targetId: string;
	/** epoch ms */
	ts: number;
	type: string;
}

export interface NormalizeContext {
	clock: RecorderClock;
	/** 事件所属的 CDP target（扁平协议下由 sessionId 反查）。 */
	targetId: string;
}

type CdpHeaders = Record<string, string>;

export interface CdpRequestWillBeSentParams {
	initiator?: { type?: string };
	redirectResponse?: {
		url: string;
		status: number;
		headers?: CdpHeaders;
	};
	request: {
		url: string;
		method: string;
		headers?: CdpHeaders;
		postData?: string;
	};
	requestId: string;
	timestamp: number;
	wallTime: number;
}

export interface CdpResponseReceivedParams {
	requestId: string;
	response: {
		status: number;
		statusText?: string;
		headers?: CdpHeaders;
		mimeType?: string;
		timing?: Record<string, number>;
		remoteIPAddress?: string;
	};
	timestamp: number;
}

export interface CdpLoadingFinishedParams {
	encodedDataLength?: number;
	requestId: string;
	timestamp: number;
}

export interface CdpLoadingFailedParams {
	canceled?: boolean;
	errorText?: string;
	requestId: string;
	timestamp: number;
}

export interface CdpRemoteObject {
	description?: string;
	type: string;
	value?: unknown;
}

export interface CdpCallFrame {
	functionName?: string;
	lineNumber?: number;
	url?: string;
}

export interface CdpConsoleApiCalledParams {
	args?: CdpRemoteObject[];
	stackTrace?: { callFrames?: CdpCallFrame[] };
	timestamp: number;
	type: string;
}

export interface CdpExceptionThrownParams {
	exceptionDetails?: {
		text?: string;
		exception?: { description?: string };
		stackTrace?: { callFrames?: CdpCallFrame[] };
	};
	timestamp: number;
}

export interface CdpLogEntryAddedParams {
	entry: {
		source: string;
		level: string;
		text: string;
		url?: string;
		timestamp: number;
	};
}

export interface CdpFrameNavigatedParams {
	frame: {
		id: string;
		url: string;
		/** 有 parentId 就是子 frame——只有主 frame 才算导航锚点。 */
		parentId?: string;
	};
}
