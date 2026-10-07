import type { MindmapNodeKind, MindmapNodeRef } from "./mindmap-node-id.ts";

export interface MindmapScope {
	readonly moduleId: string | undefined;
	readonly projectId: string;
}

export function createMindmapScope(
	projectId: string,
	moduleId: string | undefined
): MindmapScope {
	return { moduleId, projectId };
}

export function isScopedMindmap(scope: MindmapScope): boolean {
	return scope.moduleId !== undefined;
}

export function escapesMindmapScope(
	scope: MindmapScope,
	parentKind: MindmapNodeKind
): boolean {
	return isScopedMindmap(scope) && parentKind === "project";
}

export function isMindmapScopeRoot(
	scope: MindmapScope,
	ref: MindmapNodeRef
): boolean {
	return (
		scope.moduleId !== undefined &&
		ref.kind === "module" &&
		ref.id === scope.moduleId
	);
}

export const MINDMAP_SCOPE_ESCAPE_MESSAGE =
	"当前只看这一个模块，节点不能挂到项目根下；请先返回全量脑图";

export const MINDMAP_SCOPE_ROOT_REMOVE_MESSAGE =
	"当前模块是这张脑图的根，请在左侧模块树或全量脑图中删除";
