import { Skeleton } from "@automationstack/ui/components/skeleton";

const PROPERTY_KEYS = ["type", "maintainer", "tags"] as const;
const STEP_KEYS = ["step-1", "step-2", "step-3"] as const;

/**
 * 用例详情面板加载中。布局与面板一致：头部的编号、用例状态和优先级，
 * 标题、版本行和操作按钮，然后是标签页、属性和步骤。
 */
export function CaseDetailSkeleton() {
	return (
		<div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-col gap-2 px-4 pt-4 pb-3">
				<div className="flex h-5 items-center gap-2">
					<Skeleton className="h-3 w-12" />
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-5 w-10" />
					<Skeleton className="h-3 w-5" />
				</div>
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-3 w-48" />
				<div className="flex items-center justify-between pt-1">
					<Skeleton className="h-8 w-16" />
					<Skeleton className="h-8 w-16" />
				</div>
			</div>
			<div className="border-t px-4 pt-3">
				<Skeleton className="h-8 w-44" />
			</div>
			<div className="flex flex-col gap-6 p-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					{PROPERTY_KEYS.map((key) => (
						<div className="flex flex-col gap-1.5" key={key}>
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-4 w-24" />
						</div>
					))}
				</div>
				<div className="flex flex-col gap-2">
					<Skeleton className="h-3 w-14" />
					<Skeleton className="h-4 w-3/4" />
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
		</div>
	);
}
