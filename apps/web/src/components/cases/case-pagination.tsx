import { Button } from "@automationstack/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback } from "react";

import { casePageCount } from "@/components/cases/case-list-query";

interface CasePaginationProps {
	onPageChange: (page: number) => void;
	page: number;
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
	onPageChange,
	page,
	total,
}: CasePaginationProps) {
	const pageCount = casePageCount(total);
	const atFirst = page <= 1;
	const atLast = page >= pageCount;
	const goPrevious = useGuardedPageStep(atFirst, onPageChange, page - 1);
	const goNext = useGuardedPageStep(atLast, onPageChange, page + 1);

	if (pageCount <= 1) {
		return null;
	}

	return (
		<nav
			aria-label="用例分页"
			className="flex items-center justify-end gap-2 pt-1"
		>
			<Button
				aria-disabled={atFirst}
				aria-label="上一页"
				onClick={goPrevious}
				size="sm"
				type="button"
				variant="outline"
			>
				<ChevronLeftIcon data-icon="inline-start" />
				上一页
			</Button>
			<span aria-live="polite" className="text-muted-foreground text-xs">
				第 {page} / {pageCount} 页
			</span>
			<Button
				aria-disabled={atLast}
				aria-label="下一页"
				onClick={goNext}
				size="sm"
				type="button"
				variant="outline"
			>
				下一页
				<ChevronRightIcon data-icon="inline-end" />
			</Button>
		</nav>
	);
}
