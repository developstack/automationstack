/**
 * 一个 requestId 的一堆事件 → 一串 HAR entry（重定向链一跳一个）。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这里是整份 HAR
 * 里唯一「一条输入变多条输出」的地方：重定向拆链、失败与孤儿的标注方式都只在
 * 这一层成立，上游（归堆、timing 换算）和下游（分页、排序）都不关心。
 */

import {
	emptyTimings,
	findHeader,
	readHeaders,
	readNumber,
	readRecord,
	readString,
	toIsoString,
} from "./har-read";
import type { RequestBucket } from "./har-requests";
import { buildRequest, compareRequests, startedAtMs } from "./har-requests";
import { buildTimings, elapsedMs } from "./har-timings";
import type {
	HarEntry,
	HarNameValue,
	HarResponse,
	ParsedRecorderEvent,
} from "./har-types";
import { UNKNOWN } from "./har-types";

/** 重定向的那一跳：响应来自**下一条** requestWillBeSent 携带的 redirectResponse。 */
const buildRedirectEntry = (
	requestId: string,
	request: ParsedRecorderEvent,
	next: ParsedRecorderEvent
): HarEntry => {
	const redirect = readRecord(next.data, "redirectResponse");
	const headers = redirect ? readHeaders(redirect, "headers") : [];
	const nextUrl = readString(next.data, "url") ?? "";

	return {
		_requestId: requestId,
		cache: {},
		request: buildRequest(request.data),
		response: {
			bodySize: UNKNOWN,
			content: {
				mimeType: findHeader(headers, "content-type") ?? "",
				size: UNKNOWN,
			},
			cookies: [],
			headers,
			headersSize: UNKNOWN,
			httpVersion: "",
			// Location 头缺失时退回下一跳的 url——重定向目标本来就是它。
			redirectURL: findHeader(headers, "location") ?? nextUrl,
			status: redirect ? (readNumber(redirect, "status") ?? 0) : 0,
			statusText: "",
		},
		startedDateTime: toIsoString(startedAtMs(request)),
		// 重定向响应的 timing 没进事件流（只留了 status/headers/url），
		// 所以这一跳只有总耗时、没有分段。
		time: elapsedMs(request, readNumber(next.data, "timestamp")),
		timings: emptyTimings(),
	};
};

/**
 * responseReceived 里那几个字段。没有 responseReceived（失败 / 孤儿）时一律取
 * 空值：编一个默认的 status/mimeType 会让读 HAR 的人以为响应真的回来过。
 */
const readResponseBasics = (
	responseData: Record<string, unknown> | undefined
): { mimeType: string; status: number; statusText: string } => ({
	mimeType: responseData ? (readString(responseData, "mimeType") ?? "") : "",
	status: responseData ? (readNumber(responseData, "status") ?? 0) : 0,
	statusText: responseData
		? (readString(responseData, "statusText") ?? "")
		: "",
});

/**
 * 失败的那一跳：按业界惯例 status=0 + `_error`（HAR 规范里没有「失败」这个
 * 状态，DevTools 导出的 HAR 也是这么标的）。就地改写传入的 response。
 */
const applyFailure = (
	response: HarResponse,
	failedData: Record<string, unknown>
): HarResponse => {
	response.status = 0;
	response._error = readString(failedData, "errorText") ?? "";
	if (failedData.canceled === true) {
		response._canceled = true;
	}
	return response;
};

/** 最后一跳的响应：正常有 responseReceived，失败则叠一层 applyFailure。 */
const buildFinalResponse = (
	headers: HarNameValue[],
	responseData: Record<string, unknown> | undefined,
	failedData: Record<string, unknown> | undefined,
	encodedDataLength: number | undefined
): HarResponse => {
	const basics = readResponseBasics(responseData);
	const response: HarResponse = {
		bodySize: encodedDataLength ?? UNKNOWN,
		content: {
			mimeType: basics.mimeType,
			// 解压后的体积要读响应体才知道，v1 不抓响应体（plan §5.5），故未知。
			size: UNKNOWN,
		},
		cookies: [],
		headers,
		headersSize: UNKNOWN,
		httpVersion: "",
		redirectURL: findHeader(headers, "location") ?? "",
		status: basics.status,
		statusText: basics.statusText,
	};

	return failedData ? applyFailure(response, failedData) : response;
};

/** 一条请求的三个结束事件；凑成对象是为了让下面几个辅助函数的参数表收得住。 */
interface FinalEventData {
	failed: Record<string, unknown> | undefined;
	finished: Record<string, unknown> | undefined;
	response: Record<string, unknown> | undefined;
}

/** 失败与完成不会同时出现；两个都没有就是孤儿，时长无从算起。 */
const readEndTimestamp = (final: FinalEventData): number | undefined =>
	(final.failed ? readNumber(final.failed, "timestamp") : undefined) ??
	(final.finished ? readNumber(final.finished, "timestamp") : undefined);

/**
 * 两个「有才写」的可选字段：写成空值反而误导读 HAR 的人。
 * `_incomplete` 表示孤儿——只发出去了，没等到任何结束事件（会话被强杀 /
 * 请求还在飞）。就地改写传入的 entry。
 */
const annotateFinalEntry = (
	entry: HarEntry,
	final: FinalEventData
): HarEntry => {
	if (!(final.response || final.finished || final.failed)) {
		entry._incomplete = true;
	}
	const remoteIp = final.response
		? readString(final.response, "remoteIPAddress")
		: undefined;
	if (remoteIp) {
		entry.serverIPAddress = remoteIp;
	}
	return entry;
};

const buildFinalEntry = (
	requestId: string,
	request: ParsedRecorderEvent,
	bucket: RequestBucket
): HarEntry => {
	const final: FinalEventData = {
		failed: bucket.failed?.data,
		finished: bucket.finished?.data,
		response: bucket.response?.data,
	};
	const endTimestamp = readEndTimestamp(final);
	const headers = final.response ? readHeaders(final.response, "headers") : [];
	const encodedDataLength = final.finished
		? readNumber(final.finished, "encodedDataLength")
		: undefined;

	const entry: HarEntry = {
		_requestId: requestId,
		cache: {},
		request: buildRequest(request.data),
		response: buildFinalResponse(
			headers,
			final.response,
			final.failed,
			encodedDataLength
		),
		startedDateTime: toIsoString(startedAtMs(request)),
		time: elapsedMs(request, endTimestamp),
		timings: buildTimings(
			final.response ? readRecord(final.response, "timing") : undefined,
			endTimestamp
		),
	};

	return annotateFinalEntry(entry, final);
};

export const buildBucketEntries = (
	requestId: string,
	bucket: RequestBucket
): HarEntry[] => {
	// 只有结束事件、没有 requestWillBeSent（录制中途才挂上）：构造不出 request
	// 半边，HAR entry 的必填字段全是空的，不如丢掉。
	if (bucket.requests.length === 0) {
		return [];
	}
	const requests = [...bucket.requests].sort(compareRequests);

	return requests.map((request, position) => {
		const next = requests[position + 1];
		return next
			? buildRedirectEntry(requestId, request, next)
			: buildFinalEntry(requestId, request, bucket);
	});
};
