/**
 * /nodes 的路由级加载态。
 * 与就绪态共用 NodesShell，两态之间只有内容区不同。
 */
import { FarmNodesTableSkeleton } from "@/components/farm-nodes/farm-nodes-table-skeleton";
import { NodesShell } from "@/components/farm-nodes/nodes-shell";

export function FarmNodesPending() {
	return (
		<NodesShell phase="pending">
			<FarmNodesTableSkeleton />
		</NodesShell>
	);
}
