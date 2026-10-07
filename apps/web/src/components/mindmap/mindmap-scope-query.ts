import { orpc } from "@/utils/orpc";

import type { MindmapScope } from "./mindmap-scope.ts";

export function mindmapTreeQueryOptions(scope: MindmapScope) {
	return orpc.mindmap.tree.queryOptions({ input: scope });
}
