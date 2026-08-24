import { asc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type CasePriority,
	type CaseStatus,
	type CaseStep,
	testCases,
} from "../schema/test-cases";
import { createTestCaseInTx } from "./case-mutations-repository";
import { writeCaseMutation } from "./case-snapshot-core";
import {
	isModuleOp,
	type MindmapCaseOperation,
	type MindmapModuleOperation,
	type MindmapOperation,
	resolveBatchProjectId,
} from "./mindmap-operations";
import {
	createModuleInTx,
	moveModuleInTx,
	removeModuleInTx,
	renameModuleInTx,
} from "./modules-repository";
import type { DbTransaction } from "./repository-types";
import { moveTestCaseInTx, removeTestCaseInTx } from "./test-cases-repository";

export const MINDMAP_BATCH_LIMIT = 100;

/**
 * Case node rendered on the mindmap canvas.
 *
 * `steps` is included so the canvas can draw the step / expected children
 * without a per-case round trip; it is the only heavy column here, so the
 * remaining `test_cases` content (preconditions, tags, maintainer, …) stays
 * out deliberately.
 */
export interface MindmapCaseNode {
	id: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	sortOrder: number;
	status: CaseStatus;
	steps: CaseStep[];
}

export function listMindmapCaseNodes(
	projectId: string
): Promise<MindmapCaseNode[]> {
	return db
		.select({
			id: testCases.id,
			moduleId: testCases.moduleId,
			name: testCases.name,
			priority: testCases.priority,
			sortOrder: testCases.sortOrder,
			status: testCases.status,
			steps: testCases.steps,
		})
		.from(testCases)
		.where(eq(testCases.projectId, projectId))
		.orderBy(asc(testCases.moduleId), asc(testCases.sortOrder));
}

const RENAME_CASE_CHANGE_NOTE = "脑图重命名";

export type MindmapBatchResult =
	| {
			idMap: Record<string, string>;
			kind: "ok";
			/** 批次所属项目（首个操作解析所得），无法判定时为 null。 */
			projectId: string | null;
	  }
	| { index: number; kind: "failed"; reason: string };

class MindmapBatchError extends Error {
	readonly index: number;
	readonly reason: string;

	constructor(index: number, reason: string) {
		super(`mindmap batch op #${index} failed: ${reason}`);
		this.index = index;
		this.reason = reason;
	}
}

function resolveId(idMap: Map<string, string>, id: string): string {
	return idMap.get(id) ?? id;
}

async function applyModuleOp(
	tx: DbTransaction,
	op: MindmapModuleOperation,
	idMap: Map<string, string>
): Promise<string | null> {
	if (op.op === "createModule") {
		const result = await createModuleInTx(tx, {
			index: op.index,
			name: op.name,
			parentId: op.parentId === null ? null : resolveId(idMap, op.parentId),
			projectId: op.projectId,
		});
		if (result.kind !== "ok") {
			return result.kind;
		}
		idMap.set(op.tempId, result.module.id);
		return null;
	}
	if (op.op === "renameModule") {
		const result = await renameModuleInTx(tx, resolveId(idMap, op.id), op.name);
		return result.kind === "ok" ? null : result.kind;
	}
	if (op.op === "moveModule") {
		const result = await moveModuleInTx(tx, {
			id: resolveId(idMap, op.id),
			index: op.index,
			parentId: op.parentId === null ? null : resolveId(idMap, op.parentId),
		});
		return result.kind === "ok" ? null : result.kind;
	}
	const removed = await removeModuleInTx(tx, resolveId(idMap, op.id));
	return removed ? null : "not-found";
}

async function applyCaseOp(
	tx: DbTransaction,
	op: MindmapCaseOperation,
	idMap: Map<string, string>,
	actorName: string | null
): Promise<string | null> {
	if (op.op === "createCase") {
		const created = await createTestCaseInTx(tx, {
			actorName,
			index: op.index,
			moduleId: resolveId(idMap, op.moduleId),
			name: op.name,
			projectId: op.projectId,
		});
		if (created.kind !== "created") {
			return created.kind;
		}
		idMap.set(op.tempId, created.testCase.id);
		return null;
	}
	if (op.op === "renameCase") {
		const result = await writeCaseMutation(tx, {
			actorName,
			caseId: resolveId(idMap, op.id),
			changeNote: RENAME_CASE_CHANGE_NOTE,
			patch: { name: op.name },
		});
		// 改名成了原来的名字：没写版本，但操作本身是成功的。
		if (result.kind === "written" || result.kind === "unchanged") {
			return null;
		}
		return result.kind;
	}
	if (op.op === "moveCase") {
		const result = await moveTestCaseInTx(tx, {
			id: resolveId(idMap, op.id),
			index: op.index,
			moduleId: resolveId(idMap, op.moduleId),
		});
		return result.kind === "ok" ? null : result.kind;
	}
	// `blocked`（被测试任务引用，plan §3.4）与 `not-found` 一样直接作为 reason
	// 上抛，整批回滚——脑图批量里删一半留一半会让画布和库对不上。
	const removed = await removeTestCaseInTx(tx, resolveId(idMap, op.id));
	return removed.kind === "removed" ? null : removed.kind;
}

function applyOperation(
	tx: DbTransaction,
	op: MindmapOperation,
	idMap: Map<string, string>,
	actorName: string | null
): Promise<string | null> {
	return isModuleOp(op)
		? applyModuleOp(tx, op, idMap)
		: applyCaseOp(tx, op, idMap, actorName);
}

/**
 * Applies up to MINDMAP_BATCH_LIMIT mindmap operations in one transaction.
 * Creates may use tempIds which later operations can reference; the result
 * carries the tempId → real id mapping. Any failure rolls back the batch.
 */
export async function runMindmapBatch(
	operations: MindmapOperation[],
	actorName: string | null
): Promise<MindmapBatchResult> {
	const [firstOperation] = operations;
	if (!firstOperation) {
		return { idMap: {}, kind: "ok", projectId: null };
	}
	if (operations.length > MINDMAP_BATCH_LIMIT) {
		return {
			index: MINDMAP_BATCH_LIMIT,
			kind: "failed",
			reason: "batch-limit-exceeded",
		};
	}
	const idMap = new Map<string, string>();
	let projectId: string | null = null;
	try {
		await db.transaction(async (tx) => {
			projectId = await resolveBatchProjectId(tx, firstOperation);
			for (const [index, op] of operations.entries()) {
				// biome-ignore lint/performance/noAwaitInLoops: 批量操作必须按提交顺序串行应用（后项可引用前项 tempId）
				const reason = await applyOperation(tx, op, idMap, actorName);
				if (reason) {
					throw new MindmapBatchError(index, reason);
				}
			}
		});
	} catch (error) {
		if (error instanceof MindmapBatchError) {
			return { index: error.index, kind: "failed", reason: error.reason };
		}
		throw error;
	}
	return { idMap: Object.fromEntries(idMap), kind: "ok", projectId };
}
