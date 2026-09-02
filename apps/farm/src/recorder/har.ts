/**
 * events.ndjson → HAR 1.2（plan §5.5「落盘与产物」）。
 *
 * 纯函数、只吃字符串：finalize 阶段浏览器早就没了，能依赖的只有磁盘上那份
 * NDJSON。也正因为输入过了一趟磁盘，这里对**任何**输入都必须容错——坏行、
 * 乱序、缺结束事件、只有结束事件没有开头，全都跳过或降级，绝不抛异常：
 * 半程记录也要上传（plan §5.5「故障语义」），为一行坏数据丢掉整份 HAR
 * 是本末倒置。
 *
 * ## 关键换算
 *
 * - **时间轴**：entry 的 `startedDateTime` 用 requestWillBeSent 的 `wallTime`
 *   （epoch 秒，唯一的墙钟锚点）；而 `time`、`timings` 一律用 CDP 的单调
 *   `timestamp` 做**差值**——墙钟可能被 NTP 拨动，单调钟不会。
 * - **重定向**：CDP 用同一个 requestId 串起整条重定向链，第 k+1 条
 *   requestWillBeSent 里的 `redirectResponse` 是第 k 跳的响应。HAR 要求一跳
 *   一个 entry，所以 N 条 requestWillBeSent 拆成 N 个 entry：前 N-1 个的响应
 *   取下一条的 redirectResponse，最后一个才用 responseReceived / loadingFailed。
 * - **timings**：CDP 的 ResourceTiming 各段是相对 `requestTime` 的毫秒偏移，
 *   不适用的段给 -1。HAR 的语义一致（-1 = 不适用/未知），所以缺段直接透传 -1，
 *   不硬凑成 0——0 会被读 HAR 的人当成「真的零耗时」。
 * - `receive` 段 CDP 没有直接给：用 loadingFinished 的单调时间戳减去
 *   `requestTime + receiveHeadersEnd` 算出来。
 * - `blocked` 段 v1 不采集（需要 *ExtraInfo 系列事件），恒为 -1。
 * - `time` 取整条请求的实耗（结束 - 开始），**不是** timings 各段之和：
 *   我们有缺段，加起来必然对不上，实耗才是排查时想看的数。
 *
 * ## 文件构成
 *
 * 组装的各个环节按依赖顺序拆在 `har-*.ts` 里（原文件 670 行，越过了仓库
 * 300 行的上限，见 scripts/check-file-rules.js）：结构类型与两个语义常量在
 * `har-types.ts`，取值器在 `har-read.ts`，逐行解析在 `har-parse.ts`，
 * 归堆定序与 request 半边在 `har-requests.ts`，timing 换算在 `har-timings.ts`，
 * entry 组装（含重定向拆链）在 `har-entries.ts`，分页在 `har-pages.ts`。
 * 这里只留最后那一步「把它们串起来」，以及对外的导出面——`./har` 这个路径
 * 上原有的导出一个不少，调用方（含跨包的测试）不必跟着改 import。
 */

import { buildBucketEntries } from "./har-entries";
import { buildPages, resolvePageRef } from "./har-pages";
import { parseRecorderEvents } from "./har-parse";
import { groupByRequestId } from "./har-requests";
import type { HarDocument, HarEntry } from "./har-types";

// biome-ignore lint/performance/noBarrelFile: 这不是「顺手 re-export 一切」的中转文件，而是原文件本身——实现因 300 行上限（scripts/check-file-rules.js）拆去了同目录的 har-*.ts，这里把 `./har` 这个路径上原有的导出面原样补回来，调用方（含跨包按相对路径导入的测试）才不用跟着改 import
export { parseRecorderEvents } from "./har-parse";
export type {
	HarDocument,
	HarEntry,
	HarLog,
	HarNameValue,
	HarPage,
	HarRequest,
	HarResponse,
	HarTimings,
	ParsedRecorderEvent,
} from "./har-types";

const HAR_VERSION = "1.2";
const CREATOR_NAME = "automationstack-farm";
const CREATOR_VERSION = "1";

export const buildHar = (ndjson: string): HarDocument => {
	const events = parseRecorderEvents(ndjson);
	const pages = buildPages(events);
	const navigationTimestamps = pages.map((page) =>
		Date.parse(page.startedDateTime)
	);

	const buckets = groupByRequestId(events);
	const ordered: { entry: HarEntry; startMs: number; index: number }[] = [];
	for (const [requestId, bucket] of buckets) {
		for (const entry of buildBucketEntries(requestId, bucket)) {
			ordered.push({
				entry,
				index: bucket.requests[0]?.index ?? 0,
				startMs: Date.parse(entry.startedDateTime),
			});
		}
	}
	ordered.sort((left, right) =>
		left.startMs === right.startMs
			? left.index - right.index
			: left.startMs - right.startMs
	);

	const entries = ordered.map(({ entry, startMs }) => {
		const pageref = resolvePageRef(pages, navigationTimestamps, startMs);
		return pageref ? { ...entry, pageref } : entry;
	});

	return {
		log: {
			creator: { name: CREATOR_NAME, version: CREATOR_VERSION },
			entries,
			pages,
			version: HAR_VERSION,
		},
	};
};
