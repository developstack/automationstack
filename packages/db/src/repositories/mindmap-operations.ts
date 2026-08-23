import { eq } from "drizzle-orm";

import { modules } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import type { DbTransaction } from "./repository-types";

export interface CreateModuleOp {
	index?: number;
	name: string;
	op: "createModule";
	/** May reference the tempId of an earlier createModule in the batch. */
	parentId: string | null;
	projectId: string;
	tempId: string;
}

export interface RenameModuleOp {
	id: string;
	name: string;
	op: "renameModule";
}

export interface MoveModuleOp {
	id: string;
	index?: number;
	op: "moveModule";
	parentId: string | null;
}

export interface RemoveModuleOp {
	id: string;
	op: "removeModule";
}

export interface CreateCaseOp {
	index?: number;
	moduleId: string;
	name: string;
	op: "createCase";
	projectId: string;
	tempId: string;
}

export interface RenameCaseOp {
	id: string;
	name: string;
	op: "renameCase";
}

export interface MoveCaseOp {
	id: string;
	index?: number;
	moduleId: string;
	op: "moveCase";
}

export interface RemoveCaseOp {
	id: string;
	op: "removeCase";
}

export type MindmapModuleOperation =
	| CreateModuleOp
	| MoveModuleOp
	| RemoveModuleOp
	| RenameModuleOp;

export type MindmapCaseOperation =
	| CreateCaseOp
	| MoveCaseOp
	| RemoveCaseOp
	| RenameCaseOp;

export type MindmapOperation = MindmapCaseOperation | MindmapModuleOperation;

export function isModuleOp(op: MindmapOperation): op is MindmapModuleOperation {
	return (
		op.op === "createModule" ||
		op.op === "renameModule" ||
		op.op === "moveModule" ||
		op.op === "removeModule"
	);
}

/**
 * 批次所属项目：首个操作要么自带 projectId（create），
 * 要么其 id 必是真实行 id（tempId 只能出现在 create 之后）。
 * 必须在应用操作之前解析，否则删除类批次会查不到行。
 */
export async function resolveBatchProjectId(
	tx: DbTransaction,
	op: MindmapOperation
): Promise<string | null> {
	if (op.op === "createModule" || op.op === "createCase") {
		return op.projectId;
	}
	if (isModuleOp(op)) {
		const [moduleRow] = await tx
			.select({ projectId: modules.projectId })
			.from(modules)
			.where(eq(modules.id, op.id))
			.limit(1);
		return moduleRow?.projectId ?? null;
	}
	const [caseRow] = await tx
		.select({ projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.id, op.id))
		.limit(1);
	return caseRow?.projectId ?? null;
}
