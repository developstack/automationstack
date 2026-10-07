import { asc, countDistinct, eq, inArray } from "drizzle-orm";

import type { Module } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";
import { getModuleSubtreeIds } from "./module-subtree";
import type { DbTransaction } from "./repository-types";

const BLOCKED_CASE_SAMPLE_LIMIT = 3;

export interface BlockedCaseRef {
	id: string;
	name: string;
}

export interface ModuleDeleteBlocked {
	blockedCases: BlockedCaseRef[];
	kind: "blocked";
	module: Module;
	referencedByRunCount: number;
	referencedCaseCount: number;
}

export type RemoveModuleResult =
	| ModuleDeleteBlocked
	| { kind: "not-found" }
	| { kind: "removed"; module: Module };

function listBlockedCases(
	tx: DbTransaction,
	subtreeIds: string[]
): Promise<BlockedCaseRef[]> {
	return tx
		.select({ id: testCases.id, name: testCases.name })
		.from(testCases)
		.innerJoin(testRunCases, eq(testRunCases.caseId, testCases.id))
		.where(inArray(testCases.moduleId, subtreeIds))
		.groupBy(testCases.id, testCases.name)
		.orderBy(asc(testCases.name))
		.limit(BLOCKED_CASE_SAMPLE_LIMIT);
}

export async function checkModuleDeleteBlock(
	tx: DbTransaction,
	module: Module
): Promise<ModuleDeleteBlocked | null> {
	const subtreeIds = await getModuleSubtreeIds(tx, module.id);
	if (subtreeIds.length === 0) {
		return null;
	}
	const [totals] = await tx
		.select({
			caseCount: countDistinct(testRunCases.caseId),
			runCount: countDistinct(testRunCases.runId),
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(inArray(testCases.moduleId, subtreeIds));
	const referencedCaseCount = totals?.caseCount ?? 0;
	if (referencedCaseCount === 0) {
		return null;
	}
	return {
		blockedCases: await listBlockedCases(tx, subtreeIds),
		kind: "blocked",
		module,
		referencedByRunCount: totals?.runCount ?? 0,
		referencedCaseCount,
	};
}

export function describeModuleDeleteBlock(
	blocked: ModuleDeleteBlocked
): string {
	const names = blocked.blockedCases.map((item) => item.name).join("、");
	const truncated = blocked.referencedCaseCount > blocked.blockedCases.length;
	const sample = names === "" ? "" : `（${names}${truncated ? "等" : ""}）`;
	return `模块「${blocked.module.name}」下有 ${blocked.referencedCaseCount} 条用例被 ${blocked.referencedByRunCount} 个测试任务引用，无法删除${sample}；可先把这些用例改为「废弃」状态`;
}
