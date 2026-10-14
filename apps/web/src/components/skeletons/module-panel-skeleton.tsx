import { Skeleton } from "@automationstack/ui/components/skeleton";

/** 每行名称的宽度不同，看起来更像真实的模块树 */
const NAME_WIDTHS = ["w-24", "w-32", "w-20", "w-28"] as const;

function skeletonRows(rows: number): { key: string; width: string }[] {
	return Array.from({ length: rows }, (_, index) => ({
		key: `module-panel-row-${index}`,
		width: NAME_WIDTHS[index % NAME_WIDTHS.length],
	}));
}

interface ModulePanelSkeletonProps {
	rows: number;
}

/**
 * 模块面板加载中。布局与模块树一致：小标签「模块」和右侧两个按钮，
 * 每行上方是拖拽放置区，行内是展开按钮、图标和名称。
 */
export function ModulePanelSkeleton({ rows }: ModulePanelSkeletonProps) {
	return (
		<div aria-hidden="true" className="flex flex-col gap-1 p-2">
			<div className="flex min-h-7 items-center justify-between ps-2">
				<Skeleton className="h-3 w-8" />
				<div className="flex gap-1 pe-1">
					<Skeleton className="size-4" />
					<Skeleton className="size-4" />
				</div>
			</div>
			<div>
				{skeletonRows(rows).map((row) => (
					<div className="pt-1.5" key={row.key}>
						<div className="flex min-h-8 items-center gap-1 px-1">
							<span className="size-6 shrink-0" />
							<Skeleton className="size-3.5 shrink-0" />
							<Skeleton className={`h-3.5 ${row.width}`} />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
