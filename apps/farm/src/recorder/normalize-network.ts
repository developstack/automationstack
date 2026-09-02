/**
 * `Network.*` 四类事件的归一化。
 *
 * 从 `normalize.ts` 拆出来：那份文件到了 403 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为只有这四类事件
 * 走单调时钟那套换算（并由 requestWillBeSent 标定它），而且只有它们会进 HAR；
 * Runtime/Log 那几类的时间戳本来就是 epoch ms，两边的坑不一样。
 */

import type {
	CdpLoadingFailedParams,
	CdpLoadingFinishedParams,
	CdpRequestWillBeSentParams,
	CdpResponseReceivedParams,
	NormalizeContext,
	RecorderEvent,
} from "./normalize-types";
import { RECORDER_EVENT_TYPE } from "./normalize-types";
import { MS_PER_SECOND } from "./recorder-clock";

/** postData 截断阈值：4096 字符，超出只留前缀并标 truncated（plan §5.5）。 */
export const POST_DATA_MAX_CHARS = 4096;

const truncatePostData = (
	postData: string
): { text: string; truncated: boolean } =>
	postData.length > POST_DATA_MAX_CHARS
		? { text: postData.slice(0, POST_DATA_MAX_CHARS), truncated: true }
		: { text: postData, truncated: false };

export const normalizeRequestWillBeSent = (
	params: CdpRequestWillBeSentParams,
	ctx: NormalizeContext
): RecorderEvent => {
	// 全流程唯一的墙钟锚点，见文件头注释。
	ctx.clock.calibrate(params.timestamp, params.wallTime);

	const data: Record<string, unknown> = {
		headers: params.request.headers ?? {},
		initiatorType: params.initiator?.type ?? "other",
		method: params.request.method,
		requestId: params.requestId,
		timestamp: params.timestamp,
		url: params.request.url,
		wallTime: params.wallTime,
	};

	if (typeof params.request.postData === "string") {
		const { text, truncated } = truncatePostData(params.request.postData);
		data.postData = text;
		if (truncated) {
			data.postDataTruncated = true;
		}
	}

	if (params.redirectResponse) {
		// 重定向的响应是**上一跳**的响应，HAR 组装时要拆成独立 entry。
		data.redirectResponse = {
			headers: params.redirectResponse.headers ?? {},
			status: params.redirectResponse.status,
			url: params.redirectResponse.url,
		};
	}

	return {
		data,
		targetId: ctx.targetId,
		ts: params.wallTime * MS_PER_SECOND,
		type: RECORDER_EVENT_TYPE.requestWillBeSent,
	};
};

export const normalizeResponseReceived = (
	params: CdpResponseReceivedParams,
	ctx: NormalizeContext
): RecorderEvent => ({
	data: {
		headers: params.response.headers ?? {},
		mimeType: params.response.mimeType ?? "",
		remoteIPAddress: params.response.remoteIPAddress ?? "",
		requestId: params.requestId,
		status: params.response.status,
		statusText: params.response.statusText ?? "",
		// 不在 plan 的取值表里，但 HAR 算 receive 段要拿它做差，必须留。
		timestamp: params.timestamp,
		// timing 原样留着：HAR 的 timings 换算规则以后可能要调，留原始读数才改得动。
		timing: params.response.timing ?? null,
	},
	targetId: ctx.targetId,
	ts: ctx.clock.toEpochMs(params.timestamp),
	type: RECORDER_EVENT_TYPE.responseReceived,
});

export const normalizeLoadingFinished = (
	params: CdpLoadingFinishedParams,
	ctx: NormalizeContext
): RecorderEvent => ({
	data: {
		encodedDataLength: params.encodedDataLength ?? -1,
		requestId: params.requestId,
		timestamp: params.timestamp,
	},
	targetId: ctx.targetId,
	ts: ctx.clock.toEpochMs(params.timestamp),
	type: RECORDER_EVENT_TYPE.loadingFinished,
});

export const normalizeLoadingFailed = (
	params: CdpLoadingFailedParams,
	ctx: NormalizeContext
): RecorderEvent => ({
	data: {
		canceled: params.canceled ?? false,
		errorText: params.errorText ?? "",
		requestId: params.requestId,
		timestamp: params.timestamp,
	},
	targetId: ctx.targetId,
	ts: ctx.clock.toEpochMs(params.timestamp),
	type: RECORDER_EVENT_TYPE.loadingFailed,
});
