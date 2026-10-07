import { eq } from "drizzle-orm";

import { modules } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import type { DbTransaction } from "./repository-types";

export interface CreateModuleOp {
	index?: number;
	name: string;
	op: "createModule";
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
