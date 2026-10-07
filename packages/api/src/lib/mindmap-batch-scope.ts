import type { MindmapOperation } from "@automationstack/db/repositories/mindmap-operations";

export interface MindmapBatchScope {
	caseIds: string[];
	moduleIds: string[];
	projectIds: string[];
}

interface ScopeAccumulator {
	caseIds: Set<string>;
	moduleIds: Set<string>;
	projectIds: Set<string>;
}

function addModuleRef(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	id: string | null
): void {
	if (id !== null && !tempIds.has(id)) {
		acc.moduleIds.add(id);
	}
}

function addCaseRef(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	id: string
): void {
	if (!tempIds.has(id)) {
		acc.caseIds.add(id);
	}
}

function collectOperation(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	op: MindmapOperation
): void {
	switch (op.op) {
		case "createModule":
			acc.projectIds.add(op.projectId);
			addModuleRef(acc, tempIds, op.parentId);
			break;
		case "createCase":
			acc.projectIds.add(op.projectId);
			addModuleRef(acc, tempIds, op.moduleId);
			break;
		case "moveModule":
			addModuleRef(acc, tempIds, op.id);
			addModuleRef(acc, tempIds, op.parentId);
			break;
		case "renameModule":
		case "removeModule":
			addModuleRef(acc, tempIds, op.id);
			break;
		case "moveCase":
			addCaseRef(acc, tempIds, op.id);
			addModuleRef(acc, tempIds, op.moduleId);
			break;
		default:
			addCaseRef(acc, tempIds, op.id);
	}
}

export function collectMindmapBatchScope(
	operations: readonly MindmapOperation[]
): MindmapBatchScope {
	const tempIds = new Set<string>();
	const acc: ScopeAccumulator = {
		caseIds: new Set<string>(),
		moduleIds: new Set<string>(),
		projectIds: new Set<string>(),
	};
	for (const op of operations) {
		collectOperation(acc, tempIds, op);
		if (op.op === "createModule" || op.op === "createCase") {
			tempIds.add(op.tempId);
		}
	}
	return {
		caseIds: [...acc.caseIds],
		moduleIds: [...acc.moduleIds],
		projectIds: [...acc.projectIds],
	};
}
