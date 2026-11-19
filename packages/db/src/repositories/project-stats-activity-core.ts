// 项目概览的「操作日志」：谁在什么时候修改或删除了哪些用例。这个文件没有数据库依赖。

import type { CaseActivityAction } from "../schema/case-activities";

/** 操作日志只显示修改和删除。新建只用于成员工作量。 */
export const FEED_ACTIONS = [
	"updated",
	"deleted",
] as const satisfies readonly CaseActivityAction[];

export type FeedAction = (typeof FEED_ACTIONS)[number];

/** 一页的日志条数。 */
export const FEED_PAGE_SIZE = 20;

/** 一条日志最多列出的用例数。其他用例只计入总数。 */
export const FEED_ITEM_LIMIT = 20;

export interface FeedCase {
	caseId: string;
	caseName: string;
	changeNote: string | null;
	/** 用例现在是否还存在。已删除的用例不能打开。 */
	exists: boolean;
	/** 用例现在所在的模块。用例已删除时，是删除时所在的模块。 */
	moduleId: string;
	/** 这个模块的名称。模块已删除时为空。 */
	moduleName: string | null;
	/** 修改：写入后的版本。删除：删除前的版本。 */
	version: number;
}

/**
 * 一条日志：一个用户在一次操作中修改或删除的用例。
 * 同一个事务中写入的记录有相同的时间，所以一次批量操作是一条日志。
 */
export interface FeedEntry {
	action: FeedAction;
	actorName: string | null;
	at: Date;
	/** 这次操作中的用例总数，可以大于 cases 的长度。 */
	caseCount: number;
	cases: FeedCase[];
	/** 这条日志的位置。取下一页时作为游标。 */
	cursor: string;
}

export interface FeedPage {
	entries: FeedEntry[];
	/** 下一页的游标。没有更早的日志时为空。 */
	nextCursor: string | null;
}

/** 游标：日志时间的微秒数和分组键。JavaScript 的 Date 只有毫秒，所以游标保存数据库中的微秒数。 */
export interface FeedCursor {
	groupKey: string;
	micros: string;
}

const CURSOR_SEPARATOR = "|";
const MICROS_PATTERN = /^\d+$/;

export function formatFeedCursor(cursor: FeedCursor): string {
	return `${cursor.micros}${CURSOR_SEPARATOR}${cursor.groupKey}`;
}

/** 解析游标。格式不对时返回 null。 */
export function parseFeedCursor(value: string): FeedCursor | null {
	const index = value.indexOf(CURSOR_SEPARATOR);
	if (index <= 0) {
		return null;
	}
	const micros = value.slice(0, index);
	const groupKey = value.slice(index + 1);
	if (!(MICROS_PATTERN.test(micros) && groupKey)) {
		return null;
	}
	return { groupKey, micros };
}

/** 多取一条，判断是否还有下一页。 */
export function toFeedPage(entries: readonly FeedEntry[]): FeedPage {
	const page = entries.slice(0, FEED_PAGE_SIZE);
	const hasMore = entries.length > FEED_PAGE_SIZE;
	return {
		entries: page,
		nextCursor: hasMore ? (page.at(-1)?.cursor ?? null) : null,
	};
}
