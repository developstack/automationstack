import { type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import {
	FEED_ITEM_LIMIT,
	FEED_PAGE_SIZE,
	type FeedAction,
	type FeedCase,
	type FeedCursor,
	type FeedEntry,
	type FeedPage,
	formatFeedCursor,
	parseFeedCursor,
	toFeedPage,
} from "./project-stats-activity-core";

interface FeedRow extends Record<string, unknown> {
	action: FeedAction;
	actor_name: string | null;
	at: Date | string;
	case_count: number;
	cases: FeedCase[];
	group_key: string;
	micros: string;
}

function toFeedEntry(row: FeedRow): FeedEntry {
	return {
		action: row.action,
		actorName: row.actor_name,
		at: new Date(row.at),
		caseCount: Number(row.case_count),
		cases: row.cases,
		cursor: formatFeedCursor({ groupKey: row.group_key, micros: row.micros }),
	};
}

/** 游标所在的时间可能只剩一部分日志，所以除了下一页的判断多取的一个时间，再多取一个。 */
const EXTRA_FEED_TIMES = 2;

/**
 * 日志中的记录，按日志分组，并标出每条记录在日志中的位置。
 * 先按索引取最近的几个操作时间，再只读取这些时间的记录。
 */
function feedRowsSql(projectId: string, after: FeedCursor | null): SQL {
	const inFeed = sql`ca.project_id = ${projectId} and ca.action in ('updated', 'deleted')`;
	const atOrBefore =
		after === null
			? sql`true`
			: sql`ca.created_at <= to_timestamp(0) + ${after.micros}::bigint * interval '1 microsecond'`;
	return sql`
		with times as (
			select distinct ca.created_at from case_activities ca
			where ${inFeed} and ${atOrBefore}
			order by ca.created_at desc
			limit ${FEED_PAGE_SIZE + EXTRA_FEED_TIMES}
		),
		a as (
			select
				ca.*,
				(extract(epoch from ca.created_at) * 1000000)::bigint as micros,
				ca.action::text || ':' || coalesce(ca.actor_id::text, ca.actor_name, '') as group_key,
				row_number() over (
					partition by ca.created_at, ca.action, ca.actor_id, ca.actor_name
					order by ca.case_name, ca.case_id
				) as position
			from case_activities ca
			where ${inFeed} and ca.created_at in (select created_at from times)
		)`;
}

/** 每条日志的用例，最多 FEED_ITEM_LIMIT 条，按用例名称排序。 */
const FEED_CASES_SQL = sql`coalesce(json_agg(json_build_object(
	'caseId', a.case_id,
	'caseName', a.case_name,
	'changeNote', a.change_note,
	'exists', c.id is not null,
	'moduleId', coalesce(c.module_id, a.module_id),
	'moduleName', m.name,
	'version', a.version
) order by a.position) filter (where a.position <= ${FEED_ITEM_LIMIT}), '[]')`;

/**
 * 操作日志的一页，最新的在前。一条日志是一个用户在一个事务中修改或删除的用例：
 * 操作、操作人和时间都相同的记录合成一条。cursor 是上一页最后一条日志的 cursor，格式不对时从第一页开始。
 */
export async function getActivityFeed(
	projectId: string,
	cursor?: string
): Promise<FeedPage> {
	const after = cursor === undefined ? null : parseFeedCursor(cursor);
	const before =
		after === null
			? sql`true`
			: sql`(a.micros, a.group_key) < (${after.micros}::bigint, ${after.groupKey})`;
	const result = await db.execute<FeedRow>(sql`
		${feedRowsSql(projectId, after)}
		select
			a.action,
			max(a.actor_name) as actor_name,
			a.created_at as at,
			count(*)::int as case_count,
			${FEED_CASES_SQL} as cases,
			a.group_key,
			a.micros::text as micros
		from a
		left join test_cases c on c.id = a.case_id
		left join modules m on m.id = coalesce(c.module_id, a.module_id)
		where ${before}
		group by a.created_at, a.micros, a.action, a.group_key
		order by a.micros desc, a.group_key desc
		limit ${FEED_PAGE_SIZE + 1}
	`);
	return toFeedPage(result.rows.map(toFeedEntry));
}
