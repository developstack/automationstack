import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

export const DEFAULT_OPEN_DEPTH = 1;

export const FULL_EXPAND_MAX_MODULES = 40;

export type ModuleOpenOverrides = ReadonlyMap<string, boolean>;

export interface ModuleOpenContext {
	ancestorIds: ReadonlySet<string>;
	overrides: ModuleOpenOverrides;
	totalModules: number;
}

export function countModules(nodes: readonly ModuleTreeNode[]): number {
	let total = 0;
	for (const node of nodes) {
		total += 1 + countModules(node.children);
	}
	return total;
}

export function findModuleAncestorIds(
	nodes: readonly ModuleTreeNode[],
	moduleId: string | undefined
): string[] {
	if (moduleId === undefined) {
		return [];
	}
	const path: string[] = [];
	const walk = (list: readonly ModuleTreeNode[]): boolean => {
		for (const node of list) {
			if (node.id === moduleId) {
				return true;
			}
			path.push(node.id);
			if (walk(node.children)) {
				return true;
			}
			path.pop();
		}
		return false;
	};
	return walk(nodes) ? path : [];
}

/**
 * 从根到模块自身的模块 id 链。模块不在树里时返回空数组。
 * 与 findModuleAncestorIds 的差别：这里包含模块自己。
 */
export function findModuleChain(
	nodes: readonly ModuleTreeNode[],
	moduleId: string | undefined
): string[] {
	if (moduleId === undefined) {
		return [];
	}
	const walk = (
		list: readonly ModuleTreeNode[],
		path: readonly string[]
	): string[] | null => {
		for (const node of list) {
			const next = [...path, node.id];
			if (node.id === moduleId) {
				return next;
			}
			const found = walk(node.children, next);
			if (found !== null) {
				return found;
			}
		}
		return null;
	};
	return walk(nodes, []) ?? [];
}

export function isModuleOpen(
	context: ModuleOpenContext,
	moduleId: string,
	depth: number
): boolean {
	const override = context.overrides.get(moduleId);
	if (override !== undefined) {
		return override;
	}
	return (
		context.totalModules <= FULL_EXPAND_MAX_MODULES ||
		depth < DEFAULT_OPEN_DEPTH ||
		context.ancestorIds.has(moduleId)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeModuleOverrides(
	overrides: ModuleOpenOverrides
): string {
	return JSON.stringify(Object.fromEntries(overrides));
}

export function parseModuleOverrides(raw: string | null): Map<string, boolean> {
	const overrides = new Map<string, boolean>();
	if (raw === null || raw === "") {
		return overrides;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return overrides;
	}
	if (!isRecord(parsed)) {
		return overrides;
	}
	for (const [id, open] of Object.entries(parsed)) {
		if (typeof open === "boolean") {
			overrides.set(id, open);
		}
	}
	return overrides;
}
