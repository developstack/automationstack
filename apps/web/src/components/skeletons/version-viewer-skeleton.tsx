import { Skeleton } from "@automationstack/ui/components/skeleton";

const FIELD_KEYS = [
	"name",
	"status",
	"priority",
	"type",
	"maintainer",
] as const;
const STEP_KEYS = ["step-1", "step-2", "step-3"] as const;

/**
 * 快照查看和版本对比加载中。布局与最终内容一致：版本号一行、
 * 字段列表、前置条件、标签和步骤表格。
 */
export function VersionViewerSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-col gap-6">
			<div className="flex h-5 items-center gap-2">
				<Skeleton className="h-3 w-8" />
				<Skeleton className="h-4 w-8" />
				<Skeleton className="h-4 w-8" />
			</div>
			<div className="divide-y rounded-lg border px-3">
				{FIELD_KEYS.map((key) => (
					<div className="flex min-h-10 items-center gap-3 py-2" key={key}>
						<Skeleton className="h-3 w-12" />
						<Skeleton className="h-4 w-32" />
					</div>
				))}
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-3 w-14" />
				<Skeleton className="h-4 w-3/4" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-3 w-10" />
				<Skeleton className="h-5 w-24" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-3 w-14" />
				<div className="flex flex-col gap-2 rounded-lg border p-3">
					{STEP_KEYS.map((key) => (
						<Skeleton className="h-4 w-full" key={key} />
					))}
				</div>
			</div>
		</div>
	);
}
