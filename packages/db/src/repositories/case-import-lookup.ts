import { and, eq } from "drizzle-orm";

import type { TestCase } from "../schema/test-cases";
import { testCases } from "../schema/test-cases";
import type { DbTransaction } from "./repository-types";

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
