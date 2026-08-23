/**
 * `mindmap.tree` 查询项的**唯一**构造点。
 *
 * 画布（mindmap-view.tsx）、同步器的 rebuild 与 patchCache
 * （mindmap-sync-runner.ts）全部经由这里拿 queryKey / queryFn，谁也不再自己
 * 拼 `{ input: { projectId } }`。作用域参数只在 `MindmapScope` 上出现一次，
 * 这里整体透传，所以「某一处忘了带 moduleId」这件事在代码里没有落脚点。
 */
import { orpc } from "@/utils/orpc";

import type { MindmapScope } from "./mindmap-scope.ts";

export function mindmapTreeQueryOptions(scope: MindmapScope) {
	return orpc.mindmap.tree.queryOptions({ input: scope });
}
