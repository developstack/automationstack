import { sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";

export async function listProjectCaseTags(
	projectId: string
): Promise<string[]> {
	const result = await db.execute<{ tag: string }>(sql`
		select distinct tag
		from ${testCases}, jsonb_array_elements_text(${testCases.tags}) as tag
		where ${testCases.projectId} = ${sql.param(projectId)}
		order by tag
	`);
	return result.rows.map((row) => row.tag);
}
