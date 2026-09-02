/**
 * 请求侧：按 requestId 归堆、定序，以及 HAR entry 的 `request` 半边。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这些函数只认
 * requestWillBeSent 一类事件、完全不关心响应是怎么回来的——归堆与定序是
 * 「拆重定向链」的前置条件，把它和 entry 组装分开，两边的取舍才各自说得清。
 */

import { findHeader, readHeaders, readNumber, readString } from "./har-read";
import type {
	HarNameValue,
	HarRequest,
	ParsedRecorderEvent,
} from "./har-types";
import { MS_PER_SECOND, UNKNOWN } from "./har-types";
import { RECORDER_EVENT_TYPE } from "./normalize";

export interface RequestBucket {
	failed?: ParsedRecorderEvent;
	finished?: ParsedRecorderEvent;
	requests: ParsedRecorderEvent[];
	response?: ParsedRecorderEvent;
}

/** entry 的开始时刻（epoch ms）：优先 wallTime，缺了才退回信封 ts。 */
export const startedAtMs = (request: ParsedRecorderEvent): number => {
	const wallTime = readNumber(request.data, "wallTime");
	return wallTime === undefined ? request.ts : wallTime * MS_PER_SECOND;
};

export const compareRequests = (
	left: ParsedRecorderEvent,
	right: ParsedRecorderEvent
): number => {
	const delta = startedAtMs(left) - startedAtMs(right);
	// 乱序落盘时也要还原出正确的重定向顺序，所以按时间排而不是按到达顺序。
	return delta === 0 ? left.index - right.index : delta;
};

export const groupByRequestId = (
	events: ParsedRecorderEvent[]
): Map<string, RequestBucket> => {
	const buckets = new Map<string, RequestBucket>();

	for (const event of events) {
		const requestId = readString(event.data, "requestId");
		if (!requestId) {
			continue;
		}
		let bucket = buckets.get(requestId);
		if (!bucket) {
			bucket = { requests: [] };
			buckets.set(requestId, bucket);
		}
		switch (event.type) {
			case RECORDER_EVENT_TYPE.requestWillBeSent:
				bucket.requests.push(event);
				break;
			case RECORDER_EVENT_TYPE.responseReceived:
				bucket.response = event;
				break;
			case RECORDER_EVENT_TYPE.loadingFinished:
				bucket.finished = event;
				break;
			case RECORDER_EVENT_TYPE.loadingFailed:
				bucket.failed = event;
				break;
			default:
				break;
		}
	}

	return buckets;
};

const buildQueryString = (url: string): HarNameValue[] => {
	try {
		const parsed = new URL(url);
		return [...parsed.searchParams.entries()].map(([name, value]) => ({
			name,
			value,
		}));
	} catch {
		// data: / blob: / 相对地址都可能进不了 URL 解析，查询串给空即可。
		return [];
	}
};

export const buildRequest = (data: Record<string, unknown>): HarRequest => {
	const url = readString(data, "url") ?? "";
	const headers = readHeaders(data, "headers");
	const postData = readString(data, "postData");
	const request: HarRequest = {
		bodySize: postData === undefined ? 0 : Buffer.byteLength(postData, "utf8"),
		cookies: [],
		headers,
		// CDP 的协议版本（h2/http1.1）在 Network.Response.protocol 里，v1 没采，
		// 留空串而不是编一个 "HTTP/1.1"——编出来的值会误导排查。
		headersSize: UNKNOWN,
		httpVersion: "",
		method: readString(data, "method") ?? "",
		queryString: buildQueryString(url),
		url,
	};
	if (postData !== undefined) {
		request.postData = {
			mimeType: findHeader(headers, "content-type") ?? "",
			text: postData,
		};
		if (data.postDataTruncated === true) {
			request.postData._truncated = true;
		}
	}
	return request;
};
