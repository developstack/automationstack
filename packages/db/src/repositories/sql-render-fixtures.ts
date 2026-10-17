import { and, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

export interface RenderedSql {
	params: unknown[];
	sql: string;
}

/** 把查询条件转成 PostgreSQL 的 SQL 和参数，测试直接比较生成的 SQL。 */
export function renderSql(condition: SQL): RenderedSql {
	// sqlToQuery 还返回参数的类型提示（typings），这里只比较 SQL 和参数
	const { params, sql } = new PgDialect().sqlToQuery(condition);
	return { params, sql };
}

/** 用 and 连接一组查询条件后转成 SQL。条件不能为空。 */
export function renderConditions(conditions: SQL[]): RenderedSql {
	const where = and(...conditions);
	if (!where) {
		throw new Error("查询条件不能为空");
	}
	return renderSql(where);
}
