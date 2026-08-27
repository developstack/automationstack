/**
 * Pure helpers for module tree assembly and validation.
 * Rows come from the db repositories; no database access happens here.
 */

export interface ModuleRow {
	id: string;
	name: string;
	parentId: string | null;
	projectId: string;
	sortOrder: number;
}

export interface ModuleTreeNode extends ModuleRow {
	children: ModuleTreeNode[];
}

function compareSiblings(a: ModuleTreeNode, b: ModuleTreeNode): number {
	return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/** Assembles flat module rows into a sorted tree (roots have parentId null). */
export function buildModuleTree(rows: ModuleRow[]): ModuleTreeNode[] {
	const nodes = new Map<string, ModuleTreeNode>();
	for (const row of rows) {
		nodes.set(row.id, { ...row, children: [] });
	}
	const roots: ModuleTreeNode[] = [];
	for (const node of nodes.values()) {
		const parent = node.parentId === null ? null : nodes.get(node.parentId);
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}
	for (const node of nodes.values()) {
		node.children.sort(compareSiblings);
	}
	roots.sort(compareSiblings);
	return roots;
}

/** Ids of `rootId` and all of its descendants within the given rows. */
export function collectSubtreeIds(rows: ModuleRow[], rootId: string): string[] {
	const childrenByParent = new Map<string, string[]>();
	for (const row of rows) {
		if (row.parentId === null) {
			continue;
		}
		const siblings = childrenByParent.get(row.parentId) ?? [];
		siblings.push(row.id);
		childrenByParent.set(row.parentId, siblings);
	}
	const collected: string[] = [];
	// 环形 rows（脏数据）会让广度优先遍历永不终止；唯一生产调用点是浏览器里的
	// 脑图缓存 patch，卡死的是用户的标签页，所以这里必须自带 visited 兜底。
	const visited = new Set<string>();
	const queue = [rootId];
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) {
			break;
		}
		if (visited.has(id)) {
			continue;
		}
		visited.add(id);
		collected.push(id);
		queue.push(...(childrenByParent.get(id) ?? []));
	}
	return collected;
}

/**
 * True when re-parenting `moduleId` under `newParentId` would create a
 * cycle, i.e. the target parent sits inside the module's own subtree.
 */
export function wouldCreateModuleCycle(
	rows: ModuleRow[],
	moduleId: string,
	newParentId: string | null
): boolean {
	if (newParentId === null) {
		return false;
	}
	if (newParentId === moduleId) {
		return true;
	}
	return collectSubtreeIds(rows, moduleId).includes(newParentId);
}
