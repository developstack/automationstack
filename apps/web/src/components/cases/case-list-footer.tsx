import { Loader2Icon } from "lucide-react";

import { casePageCount, caseRange } from "@/components/cases/case-list-query";
import {
	CasePagination,
	type CasePaginationProps,
} from "@/components/cases/case-pagination";
import { CASE_LIST_FOOTER_CLASS } from "@/components/cases/case-table-layout";

interface CaseListCountProps {
	page: number;
	stale: boolean;
	total: number;
}

/** 当前页显示第几条到第几条、一共多少条。加载新结果时显示加载图标。 */
function CaseListCount({ page, stale, total }: CaseListCountProps) {
	const { first, last } = caseRange(page, total);
	const singlePage = casePageCount(total) <= 1;
	return (
		<p
			aria-busy={stale}
			className="flex items-center gap-2 text-muted-foreground text-xs"
			role="status"
		>
			<span>
				{singlePage ? null : (
					<>
						第 <span className="numeric text-foreground">{first}</span>–
						<span className="numeric text-foreground">{last}</span> 条，
					</>
				)}
				共 <span className="numeric text-foreground">{total}</span> 条
			</span>
			{stale ? (
				<>
					<Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
					<span className="sr-only">正在加载</span>
				</>
			) : null}
		</p>
	);
}

interface CaseListFooterProps extends CasePaginationProps {
	stale: boolean;
}

/** 列表底部：条数和分页。翻页和筛选时一直留在原位。 */
export function CaseListFooter({
	onPageChange,
	page,
	stale,
	total,
}: CaseListFooterProps) {
	return (
		<div className={CASE_LIST_FOOTER_CLASS}>
			<CaseListCount page={page} stale={stale} total={total} />
			<CasePagination onPageChange={onPageChange} page={page} total={total} />
		</div>
	);
}
