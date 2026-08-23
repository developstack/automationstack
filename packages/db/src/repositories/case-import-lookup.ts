import { and, eq } from "drizzle-orm";

import type { TestCase } from "../schema/test-cases";
import { testCases } from "../schema/test-cases";
import type { DbTransaction } from "./repository-types";

/**
 * Duplicate lookups used by the import pipeline. Both run inside the caller's
 * transaction so a row found here cannot disappear before it is acted on.
 */

/** Primary dedupe key: a case already imported from the same source row. */
export async function findBySourceRef(
	tx: DbTransaction,
	projectId: string,
	sourceRef: string
): Promise<TestCase | null> {
	const [row] = await tx
		.select()
		.from(testCases)
		.where(
			and(
				eq(testCases.projectId, projectId),
				eq(testCases.sourceRef, sourceRef)
			)
		)
		.limit(1);
	return row ?? null;
}

/** Fallback dedupe for rows without a sourceRef: same name in same module. */
export async function findByNameInModule(
	tx: DbTransaction,
	moduleId: string,
	name: string
): Promise<TestCase | null> {
	const [row] = await tx
		.select()
		.from(testCases)
		.where(and(eq(testCases.moduleId, moduleId), eq(testCases.name, name)))
		.limit(1);
	return row ?? null;
}
