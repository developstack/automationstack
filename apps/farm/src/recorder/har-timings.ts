/**
 * CDP 的 ResourceTiming → HAR 的 `timings` 与 `time`。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为整份 HAR 里最需要
 * 逐段解释的换算全在这几个函数里（各段的口径、为什么缺段透传 -1、receive 段
 * 为什么要拿 loadingFinished 的时间戳倒推），它们和 entry 的字段搬运不是一类
 * 活儿，混在一起时那些注释很容易被当成 entry 组装的说明。
 */

import { emptyTimings, readNumber, round } from "./har-read";
import type { HarTimings, ParsedRecorderEvent } from "./har-types";
import { MS_PER_SECOND, UNKNOWN } from "./har-types";

/** wait = 「响应头收完」-「请求发完」。任一端读不到或倒挂都算未知，不硬凑。 */
const computeWaitMs = (timing: Record<string, unknown>): number => {
	const sendEnd = readNumber(timing, "sendEnd");
	const receiveHeadersEnd = readNumber(timing, "receiveHeadersEnd");
	return sendEnd !== undefined &&
		receiveHeadersEnd !== undefined &&
		sendEnd >= 0 &&
		receiveHeadersEnd >= sendEnd
		? round(receiveHeadersEnd - sendEnd)
		: UNKNOWN;
};

/**
 * receive = 「响应体收完」-「响应头收完」。前者只有 loadingFinished 的单调
 * 时间戳知道，后者是 requestTime + receiveHeadersEnd。
 */
const computeReceiveMs = (
	timing: Record<string, unknown>,
	endTimestampSeconds: number | undefined
): number => {
	const requestTime = readNumber(timing, "requestTime");
	const receiveHeadersEnd = readNumber(timing, "receiveHeadersEnd");
	if (
		requestTime === undefined ||
		endTimestampSeconds === undefined ||
		receiveHeadersEnd === undefined ||
		receiveHeadersEnd < 0
	) {
		return UNKNOWN;
	}
	const headersDoneMs = requestTime * MS_PER_SECOND + receiveHeadersEnd;
	const endMs = endTimestampSeconds * MS_PER_SECOND;
	return endMs >= headersDoneMs ? round(endMs - headersDoneMs) : UNKNOWN;
};

/** 单个 timing 分段：两端都要读得到且不倒挂，否则 -1（未知/不适用）。 */
const spanMs = (
	timing: Record<string, unknown>,
	startKey: string,
	endKey: string
): number => {
	const start = readNumber(timing, startKey);
	const end = readNumber(timing, endKey);
	if (start === undefined || end === undefined || start < 0 || end < start) {
		return UNKNOWN;
	}
	return round(end - start);
};

export const buildTimings = (
	timing: Record<string, unknown> | undefined,
	endTimestampSeconds: number | undefined
): HarTimings => {
	if (!timing) {
		return emptyTimings();
	}
	return {
		blocked: UNKNOWN,
		connect: spanMs(timing, "connectStart", "connectEnd"),
		dns: spanMs(timing, "dnsStart", "dnsEnd"),
		receive: computeReceiveMs(timing, endTimestampSeconds),
		send: spanMs(timing, "sendStart", "sendEnd"),
		ssl: spanMs(timing, "sslStart", "sslEnd"),
		wait: computeWaitMs(timing),
	};
};

export const elapsedMs = (
	request: ParsedRecorderEvent,
	endTimestampSeconds: number | undefined
): number => {
	const startTimestamp = readNumber(request.data, "timestamp");
	if (startTimestamp === undefined || endTimestampSeconds === undefined) {
		return UNKNOWN;
	}
	const delta = (endTimestampSeconds - startTimestamp) * MS_PER_SECOND;
	return delta < 0 ? UNKNOWN : round(delta);
};
