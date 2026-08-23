/**
 * 画布当前看的是「哪个项目的哪个模块」。
 *
 * 这个对象是**单一事实源**：`mindmap.tree` 的查询项只有一个构造点
 * （mindmap-scope-query.ts），画布读的 query 与同步器补的 query 因此必然是
 * 同一个键。以前 projectId 在三处各写一遍（画布、rebuild、patchCache），
 * 加第二个参数时就漏了两处；现在它们拿到的是同一个 `MindmapScope` 引用。
 *
 * `moduleId` 故意写成**必填的 `string | undefined`** 而不是 `moduleId?:`：
 * 构造一个 MindmapScope 时必须显式表态「全项目还是某个模块」，忘记写就是
 * 编译错误。以后再加第三个作用域参数（例如 includeSteps / 优先级过滤）时，
 * 只要照这个写法加进本接口，所有构造点都会在类型层面当场报错，而查询项的
 * 构造点仍然只有一个，不存在「某一处忘了传」的空间。
 */

import type { MindmapNodeKind, MindmapNodeRef } from "./mindmap-node-id.ts";

export interface MindmapScope {
	/** undefined = 全量脑图（整个项目）；否则只画该模块及其子孙。 */
	readonly moduleId: string | undefined;
	readonly projectId: string;
}

export function createMindmapScope(
	projectId: string,
	moduleId: string | undefined
): MindmapScope {
	return { moduleId, projectId };
}

/** 是否处于「只看一个模块」的作用域视图。 */
export function isScopedMindmap(scope: MindmapScope): boolean {
	return scope.moduleId !== undefined;
}

/**
 * 作用域视图里，把节点挂到 `parentKind` 这种父级下会不会掉出作用域。
 *
 * 服务端返回的 modules 是 `[该模块子树]`，项目根节点是前端 adapter 自己造的
 * （mindmap-adapter.ts 的 encodeProjectNodeId），所以画布上「项目根」这个父级
 * 对应的是 `parentId: null`，也就是项目级模块 —— 它不属于当前作用域，建出来
 * 或移过去之后会立刻从画布上消失，看起来像操作失败了。作用域视图下必须拦掉。
 */
export function escapesMindmapScope(
	scope: MindmapScope,
	parentKind: MindmapNodeKind
): boolean {
	return isScopedMindmap(scope) && parentKind === "project";
}

/**
 * 该节点是否就是这张作用域脑图的根模块。删掉它，服务端下一次 `mindmap.tree`
 * 会返回 NOT_FOUND，整页变成加载失败，所以在画布上一律拦掉，让用户去模块树
 * 或全量脑图里删。
 */
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
