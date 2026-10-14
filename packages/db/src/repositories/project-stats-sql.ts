import { type SQL, sql } from "drizzle-orm";

/** 满足条件的行数，例如 count(*) filter (where status = 'active')。 */
export function countWhere(condition: SQL): SQL<number> {
	return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}
