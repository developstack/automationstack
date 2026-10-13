import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

import {
	PAGE_HEADER_ROW_CLASS,
	PAGE_HEADER_TITLE_COLUMN_CLASS,
} from "@/components/layout/page-header-layout";

interface PageHeaderSkeletonProps {
	actionCount?: number;
	className?: string;
}

const ACTION_KEYS = ["a1", "a2", "a3"] as const;

/** 标题要等数据才知道的页面用这个骨架，尺寸与 PageHeader 一致。 */
export function PageHeaderSkeleton({
	actionCount = 0,
	className,
}: PageHeaderSkeletonProps) {
	return (
		<div aria-hidden="true" className={cn(PAGE_HEADER_ROW_CLASS, className)}>
			<div className={PAGE_HEADER_TITLE_COLUMN_CLASS}>
				<Skeleton className="h-8 w-56" />
			</div>
			{actionCount > 0 ? (
				<div className="flex items-center gap-2">
					{ACTION_KEYS.slice(0, actionCount).map((key) => (
						<Skeleton className="h-8 w-24" key={key} />
					))}
				</div>
			) : null}
		</div>
	);
}
