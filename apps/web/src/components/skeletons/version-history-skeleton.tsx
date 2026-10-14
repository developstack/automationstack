import { Skeleton } from "@automationstack/ui/components/skeleton";
import { VersionViewerSkeleton } from "@/components/skeletons/version-viewer-skeleton";
import { VERSION_HISTORY_GRID_CLASS } from "@/components/versions/version-history-layout";

const ROW_KEYS = ["row-1", "row-2", "row-3", "row-4"] as const;

/** 版本历史加载中。左侧是版本列表，右侧是查看区，与最终布局一致。 */
export function VersionHistorySkeleton() {
	return (
		<div aria-hidden="true" className={VERSION_HISTORY_GRID_CLASS}>
			<div className="flex flex-col gap-2">
				<div className="flex h-6 items-center">
					<Skeleton className="h-3 w-16" />
				</div>
				<div className="divide-y rounded-lg border">
					{ROW_KEYS.map((key) => (
						<div className="flex flex-col gap-2 py-3 pr-2 pl-4" key={key}>
							<Skeleton className="h-4 w-10" />
							<Skeleton className="h-3 w-32" />
						</div>
					))}
				</div>
			</div>
			<div className="md:col-span-2">
				<VersionViewerSkeleton />
			</div>
		</div>
	);
}
