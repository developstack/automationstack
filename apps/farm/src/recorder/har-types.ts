/**
 * HAR 1.2 的结构类型，外加两个贯穿整条组装链路的语义常量。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一层一行逻辑
 * 都没有——它就是 HAR 规范那几个结构的 TypeScript 投影，组装链路上的每个模块
 * 都要 import 它；放在依赖图最底下，拆出来的那几个文件之间才不会绕出环。
 */

/** HAR 里 -1 的统一语义：未知 / 不适用。 */
export const UNKNOWN = -1;
export const MS_PER_SECOND = 1000;

export interface HarNameValue {
	name: string;
	value: string;
}

export interface HarTimings {
	blocked: number;
	connect: number;
	dns: number;
	receive: number;
	send: number;
	ssl: number;
	wait: number;
}

export interface HarRequest {
	bodySize: number;
	cookies: HarNameValue[];
	headers: HarNameValue[];
	headersSize: number;
	httpVersion: string;
	method: string;
	postData?: { mimeType: string; text: string; _truncated?: boolean };
	queryString: HarNameValue[];
	url: string;
}

export interface HarResponse {
	_canceled?: boolean;
	_error?: string;
	bodySize: number;
	content: { size: number; mimeType: string };
	cookies: HarNameValue[];
	headers: HarNameValue[];
	headersSize: number;
	httpVersion: string;
	redirectURL: string;
	status: number;
	statusText: string;
}

export interface HarEntry {
	/** 只有 requestWillBeSent、没有任何结束事件的孤儿请求。 */
	_incomplete?: boolean;
	/** 自定义扩展（HAR 允许 `_` 前缀）：回查原始事件流用。 */
	_requestId: string;
	cache: Record<string, never>;
	pageref?: string;
	request: HarRequest;
	response: HarResponse;
	serverIPAddress?: string;
	startedDateTime: string;
	time: number;
	timings: HarTimings;
}

export interface HarPage {
	id: string;
	pageTimings: { onContentLoad: number; onLoad: number };
	startedDateTime: string;
	title: string;
}

export interface HarLog {
	creator: { name: string; version: string };
	entries: HarEntry[];
	pages: HarPage[];
	version: string;
}

export interface HarDocument {
	log: HarLog;
}

export interface ParsedRecorderEvent {
	data: Record<string, unknown>;
	/** 行号：所有排序的最后一道 tie-breaker，保证输出稳定可测。 */
	index: number;
	targetId: string;
	ts: number;
	type: string;
}
