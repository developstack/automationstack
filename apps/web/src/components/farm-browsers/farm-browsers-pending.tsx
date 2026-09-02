/**
 * /browsers（镜像库）的路由级加载态。
 * 与就绪态共用 BrowsersShell，两态之间只有内容区不同。
 */
import { BrowsersShell } from "@/components/farm-browsers/browsers-shell";
import { FarmBrowsersTableSkeleton } from "@/components/farm-browsers/farm-browsers-table-skeleton";

export function FarmBrowsersPending() {
	return (
		<BrowsersShell phase="pending">
			<FarmBrowsersTableSkeleton />
		</BrowsersShell>
	);
}
