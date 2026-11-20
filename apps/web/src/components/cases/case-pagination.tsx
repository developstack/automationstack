import { Button } from "@automationstack/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback } from "react";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";

export interface CasePaginationProps {
	/** 分页导航的无障碍名称。默认为「用例分页」。 */
	label?: string;
	onPageChange: (page: number) => void;
	page: number;
	/** 每页的条数。默认为用例列表的条数。 */
	pageSize?: number;
	total: number;
}

function useGuardedPageStep(
	disabled: boolean,
	onPageChange: (page: number) => void,
	targetPage: number
) {
	return useCallback(() => {
		if (disabled) {
			return;
		}
		onPageChange(targetPage);
	}, [disabled, onPageChange, targetPage]);
}

export function CasePagination({
	label = "用例分页",
	onPageChange,
	page,
	pageSize = CASE_PAGE_SIZE,
	total,
}: CasePaginationProps) {
	const pageCount = Math.max(Math.ceil(total / pageSize), 1);
	const atFirst = page <= 1;
	const atLast = page >= pageCount;
	const goPrevious = useGuardedPageStep(atFirst, onPageChange, page - 1);
	const goNext = useGuardedPageStep(atLast, onPageChange, page + 1);

	if (pageCount <= 1) {
		return null;
	}

	return (
		<nav aria-label={label} className="flex items-center justify-end gap-1">
			<Button
				aria-disabled={atFirst}
				aria-label="上一页"
				onClick={goPrevious}
				size="sm"
				type="button"
				variant="ghost"
			>
				<ChevronLeftIcon data-icon="inline-start" />
				上一页
			</Button>
			<span aria-live="polite" className="px-1 text-muted-foreground text-xs">
				第 <span className="numeric text-foreground">{page}</span> /{" "}
				<span className="numeric">{pageCount}</span> 页
			</span>
			<Button
				aria-disabled={atLast}
				aria-label="下一页"
				onClick={goNext}
				size="sm"
				type="button"
				variant="ghost"
			>
				下一页
				<ChevronRightIcon data-icon="inline-end" />
			</Button>
		</nav>
	);
}
