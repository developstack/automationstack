import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";

import { CaseListError } from "@/components/cases/case-list-error";
import { CaseDetailSkeleton } from "@/components/skeletons/case-detail-skeleton";

// 加载中和加载失败时没有用例名称，标题只给读屏软件
function CaseDetailFallbackTitle() {
	return (
		<SheetHeader className="sr-only">
			<SheetTitle>用例详情</SheetTitle>
			<SheetDescription>用例的详情和版本历史</SheetDescription>
		</SheetHeader>
	);
}

interface CaseDetailPendingProps {
	query: {
		error: unknown;
		isError: boolean;
		isFetching: boolean;
		refetch: () => Promise<unknown>;
	};
}

/** 用例详情还没有载入：加载中显示骨架屏，加载失败显示原因和重试。 */
export function CaseDetailPending({ query }: CaseDetailPendingProps) {
	return (
		<>
			<CaseDetailFallbackTitle />
			{query.isError ? (
				<div className="flex min-h-0 flex-1 items-center justify-center p-4">
					<CaseListError query={query} title="用例详情加载失败" />
				</div>
			) : (
				<CaseDetailSkeleton />
			)}
		</>
	);
}
