/**
 * HAR 的 `pages` 与 entry 的页面归属。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为分页只吃
 * frameNavigated 这一类事件，与请求侧的组装完全不交叉；归属判断的那条边界
 * （主文档请求先于导航事件）也只有放在一起看才讲得明白。
 */

import { readString, toIsoString } from "./har-read";
import type { HarPage, ParsedRecorderEvent } from "./har-types";
import { UNKNOWN } from "./har-types";
import { RECORDER_EVENT_TYPE } from "./normalize";

export const buildPages = (events: ParsedRecorderEvent[]): HarPage[] =>
	events
		.filter((event) => event.type === RECORDER_EVENT_TYPE.frameNavigated)
		.sort((left, right) =>
			left.ts === right.ts ? left.index - right.index : left.ts - right.ts
		)
		.map((event, position) => ({
			id: `page_${position}`,
			pageTimings: { onContentLoad: UNKNOWN, onLoad: UNKNOWN },
			startedDateTime: toIsoString(event.ts),
			// HAR 的 title 通常是页面标题，我们没订阅 Page.title，用 url 更实用。
			title: readString(event.data, "url") ?? "",
		}));

/**
 * entry 归属哪一页：取「开始时刻之前最后一次导航」。
 *
 * 注意首页的边界——主文档请求**先于** frameNavigated 发出（导航事件是响应回来
 * 才触发的），所以早于第一次导航的 entry 一律归 page_0，否则每一页的主文档请求
 * 都会掉出自己的页面。
 */
export const resolvePageRef = (
	pages: HarPage[],
	navigationTimestamps: number[],
	startMs: number
): string | undefined => {
	const [firstPage] = pages;
	if (!firstPage) {
		// 一次导航都没有（比如脚本只发了 XHR）：不编造 page，entry 就不带 pageref。
		return undefined;
	}
	let matched = 0;
	for (const [position, navigatedAt] of navigationTimestamps.entries()) {
		if (navigatedAt <= startMs) {
			matched = position;
		} else {
			break;
		}
	}
	return pages[matched]?.id;
};
