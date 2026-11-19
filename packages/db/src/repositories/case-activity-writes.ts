import { asc, inArray } from "drizzle-orm";
import {
	type CaseActivityAction,
	caseActivities,
} from "../schema/case-activities";

import { type TestCase, testCases } from "../schema/test-cases";
import { getModuleSubtreeIds } from "./module-subtree";
import type { DbTransaction } from "./repository-types";

/** 写入用例的用户。通过 API Token 或 MCP 写入时是 Token 所属的用户。 */
export interface CaseActor {
	actorId: string | null;
	actorName: string | null;
}

interface CaseActivityInput {
	action: CaseActivityAction;
	actor: CaseActor;
	changeNote?: string | null;
	/** 写入后的用例；删除时是删除前的用例。 */
	testCase: TestCase;
}

/** 写入用例操作记录，必须与用例的写入在同一个事务中。 */
export async function insertCaseActivities(
	tx: DbTransaction,
	inputs: readonly CaseActivityInput[]
): Promise<void> {
	if (inputs.length === 0) {
		return;
	}
	await tx.insert(caseActivities).values(
		inputs.map(({ action, actor, changeNote, testCase }) => ({
			action,
			actorId: actor.actorId,
			actorName: actor.actorName,
			caseId: testCase.id,
			caseName: testCase.name,
			changeNote: changeNote ?? null,
			moduleId: testCase.moduleId,
			projectId: testCase.projectId,
			version: testCase.currentVersion,
		}))
	);
}

/** 删除用例之前或之后（同一个事务中）记录删除。用例行删除后，这些记录仍然保留。 */
export function recordCaseDeletions(
	tx: DbTransaction,
	removed: readonly TestCase[],
	actor: CaseActor
): Promise<void> {
	return insertCaseActivities(
		tx,
		removed.map((testCase) => ({ action: "deleted", actor, testCase }))
	);
}

/** 删除模块时，子树中的用例随模块一起删除。在删除模块之前调用，记录这些用例的删除。 */
export async function recordModuleCaseDeletions(
	tx: DbTransaction,
	moduleId: string,
	actor: CaseActor
): Promise<void> {
	const moduleIds = await getModuleSubtreeIds(tx, moduleId);
	const removed = await tx
		.select()
		.from(testCases)
		.where(inArray(testCases.moduleId, moduleIds))
		.orderBy(asc(testCases.id));
	await recordCaseDeletions(tx, removed, actor);
}
