import { sql } from "drizzle-orm";

import type { db } from "../index";
import type { DbTransaction } from "./repository-types";

type SubtreeExecutor = DbTransaction | typeof db;

/**
 * Returns the ids of `rootId` and every descendant module (recursive CTE).
 * Used for move-cycle detection and "include descendants" case filtering.
 */
export async function getModuleSubtreeIds(
	executor: SubtreeExecutor,
	rootId: string
): Promise<string[]> {
	const result = await executor.execute(sql`
		WITH RECURSIVE subtree AS (
			SELECT id FROM modules WHERE id = ${rootId}
			UNION ALL
			SELECT m.id FROM modules m
			INNER JOIN subtree s ON m.parent_id = s.id
		)
		SELECT id FROM subtree
	`);
	return result.rows.map((row) => String(row.id));
}
