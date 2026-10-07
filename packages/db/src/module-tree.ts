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
