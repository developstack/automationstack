/* eslint-disable no-magic-numbers -- 这是测试夹具：eslint.config.js 已经对
   测试文件（`.test.ts` / `.spec.ts`）关掉了这条规则，理由见那里的注释——
   测试数据就该是字面量。本文件落在那条豁免之外只是因为它不能叫 .test.ts：
   vitest 的 include 会把它当成套件收走，而它一个 it() 都没有，会当场报
   「No test suite found」。 */

/**
 * `har.test.ts` 系列共用的事件夹具。
 *
 * 从 `har.test.ts` 拆出来：那份文件到了 355 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js），按 describe 分成了三个文件；这几个构造器是
 * 它们的公共前提，抄三份的话「夹具与 normalize.ts 的输出对齐」这条约束就会
 * 在三个地方各自漂移。
 */

import { RECORDER_EVENT_TYPE } from "./normalize";

/** 事件信封的最小构造器：字段与 normalize.ts 的输出严格对齐。 */
export const envelope = (
	type: string,
	ts: number,
	data: Record<string, unknown>
): Record<string, unknown> => ({ data, targetId: "T1", ts, type });

export const requestEvent = (
	overrides: Record<string, unknown> = {}
): Record<string, unknown> => {
	const data = {
		headers: { "user-agent": "chrome" },
		initiatorType: "parser",
		method: "GET",
		requestId: "REQ-1",
		timestamp: 1000,
		url: "https://example.com/?q=1&x=2",
		wallTime: 1_700_000_000,
		...overrides,
	};
	return envelope(
		RECORDER_EVENT_TYPE.requestWillBeSent,
		(data.wallTime as number) * 1000,
		data
	);
};

export const responseEvent = (
	overrides: Record<string, unknown> = {}
): Record<string, unknown> =>
	envelope(RECORDER_EVENT_TYPE.responseReceived, 1_700_000_000_100, {
		headers: { "content-type": "text/html" },
		mimeType: "text/html",
		remoteIPAddress: "1.2.3.4",
		requestId: "REQ-1",
		status: 200,
		statusText: "OK",
		timestamp: 1000.1,
		timing: {
			connectEnd: 20,
			connectStart: 5,
			dnsEnd: 5,
			dnsStart: 0,
			receiveHeadersEnd: 60,
			requestTime: 1000.05,
			sendEnd: 22,
			sendStart: 20,
			sslEnd: 20,
			sslStart: 10,
		},
		...overrides,
	});

export const finishedEvent = (
	overrides: Record<string, unknown> = {}
): Record<string, unknown> =>
	envelope(RECORDER_EVENT_TYPE.loadingFinished, 1_700_000_000_500, {
		encodedDataLength: 1234,
		requestId: "REQ-1",
		timestamp: 1000.5,
		...overrides,
	});

export const navigationEvent = (
	ts: number,
	url: string
): Record<string, unknown> =>
	envelope(RECORDER_EVENT_TYPE.frameNavigated, ts, {
		frameId: "F1",
		timestamp: ts,
		url,
	});

export const toNdjson = (...events: Record<string, unknown>[]): string =>
	`${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
