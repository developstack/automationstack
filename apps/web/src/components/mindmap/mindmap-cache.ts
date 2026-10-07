import {
	buildModuleTree,
	collectSubtreeIds,
	type ModuleRow,
} from "@automationstack/api/lib/module-tree";

import { placeInGroup, removeFromGroups } from "./mindmap-cache-order.ts";
import type {
	MindmapBatchOperation,
	ResolveEntityId,
} from "./mindmap-operation-map.ts";
import type { MindmapCaseRow, MindmapTreeData } from "./mindmap-tree-input.ts";

const DEFAULT_CASE_PRIORITY = "P2" as const;
const DEFAULT_CASE_STATUS = "draft" as const;

type ModuleOperation = Extract<
	MindmapBatchOperation,
	{ op: `${string}Module` }
>;
type CaseOperation = Exclude<MindmapBatchOperation, ModuleOperation>;

const moduleGroup = (row: ModuleRow) => row.parentId ?? "";
const caseGroup = (row: MindmapCaseRow) => row.moduleId;

function flattenModules(
	nodes: MindmapTreeData["modules"],
	into: ModuleRow[]
): ModuleRow[] {
	for (const node of nodes) {
		into.push({
			id: node.id,
			name: node.name,
			parentId: node.parentId,
			projectId: node.projectId,
			sortOrder: node.sortOrder,
		});
		flattenModules(node.children, into);
	}
	return into;
}

function applyModuleOp(
	rows: ModuleRow[],
	op: ModuleOperation,
	resolveId: ResolveEntityId
): ModuleRow[] {
	if (op.op === "createModule") {
		const parentId = op.parentId === null ? null : resolveId(op.parentId);
		const entry: ModuleRow = {
			id: resolveId(op.tempId),
			name: op.name,
			parentId,
			projectId: op.projectId,
			sortOrder: 0,
		};
		return placeInGroup(
			rows,
			(row) => row.parentId === parentId,
			entry,
			op.index
		);
	}
	const id = resolveId(op.id);
	if (op.op === "renameModule") {
		return rows.map((row) => (row.id === id ? { ...row, name: op.name } : row));
	}
	if (op.op === "removeModule") {
		return removeFromGroups(
			rows,
			new Set(collectSubtreeIds([...rows], id)),
			moduleGroup
		);
	}
	const current = rows.find((row) => row.id === id);
	if (current === undefined) {
		return rows;
	}
	const parentId = op.parentId === null ? null : resolveId(op.parentId);
	const detached = removeFromGroups(rows, new Set([id]), moduleGroup);
	return placeInGroup(
		detached,
		(row) => row.parentId === parentId,
		{ ...current, parentId },
		op.index
	);
}

function applyCaseOp(
	rows: MindmapCaseRow[],
	op: CaseOperation,
	resolveId: ResolveEntityId
): MindmapCaseRow[] {
	if (op.op === "createCase") {
		const moduleId = resolveId(op.moduleId);
		const entry: MindmapCaseRow = {
			id: resolveId(op.tempId),
			moduleId,
			name: op.name,
			priority: DEFAULT_CASE_PRIORITY,
			sortOrder: 0,
			status: DEFAULT_CASE_STATUS,
			steps: [],
		};
		return placeInGroup(
			rows,
			(row) => row.moduleId === moduleId,
			entry,
			op.index
		);
	}
	const id = resolveId(op.id);
	if (op.op === "renameCase") {
		return rows.map((row) => (row.id === id ? { ...row, name: op.name } : row));
	}
	if (op.op === "removeCase") {
		return removeFromGroups(rows, new Set([id]), caseGroup);
	}
	const current = rows.find((row) => row.id === id);
	if (current === undefined) {
		return rows;
	}
	const moduleId = resolveId(op.moduleId);
	const detached = removeFromGroups(rows, new Set([id]), caseGroup);
	return placeInGroup(
		detached,
		(row) => row.moduleId === moduleId,
		{ ...current, moduleId },
		op.index
	);
}

function isModuleOp(op: MindmapBatchOperation): op is ModuleOperation {
	return op.op.endsWith("Module");
}

function dropOrphanCases(
	cases: MindmapCaseRow[],
	rows: readonly ModuleRow[]
): MindmapCaseRow[] {
	const alive = new Set(rows.map((row) => row.id));
	return cases.filter((row) => alive.has(row.moduleId));
}

export function patchMindmapTree(
	data: MindmapTreeData,
	operations: readonly MindmapBatchOperation[],
	idMap: Readonly<Record<string, string>>
): MindmapTreeData {
	const resolveId: ResolveEntityId = (id) => idMap[id] ?? id;
	let rows = flattenModules(data.modules, []);
	let cases = [...data.cases];
	for (const op of operations) {
		if (isModuleOp(op)) {
			rows = applyModuleOp(rows, op, resolveId);
			cases = dropOrphanCases(cases, rows);
		} else {
			cases = applyCaseOp(cases, op, resolveId);
		}
	}
	return { cases, modules: buildModuleTree(rows) };
}
