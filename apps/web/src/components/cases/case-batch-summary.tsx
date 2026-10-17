import { Button } from "@automationstack/ui/components/button";

import type { CaseSelection } from "@/components/cases/use-case-selection";
import { pageSelectionState } from "@/components/interaction/page-selection";

interface CaseBatchSummaryProps {
	pageIds: readonly string[];
	selection: CaseSelection;
	/** 符合当前筛选的用例总数，与列表的条数相同。 */
	total: number;
}

const Count = ({ value }: { value: number }) => (
	<span className="numeric font-medium">{value}</span>
);

/**
 * 批量操作栏中已选的范围。当前页全选、还有没有勾选的符合筛选的用例时，
 * 提供「选择全部 N 条符合筛选的用例」。
 */
export function CaseBatchSummary({
	pageIds,
	selection,
	total,
}: CaseBatchSummaryProps) {
	const { allMatching, ids, selectAllMatching } = selection;
	if (allMatching) {
		return (
			<p className="text-sm" role="status">
				已选全部 <Count value={total} /> 条符合筛选的用例
			</p>
		);
	}
	const pageSelected = pageSelectionState(ids, pageIds) === "all";
	const onlyThisPage = pageSelected && ids.size === pageIds.length;
	const canSelectAll = pageSelected && total > ids.size;
	return (
		<>
			<p className="text-sm" role="status">
				{onlyThisPage ? "已选本页" : "已选"} <Count value={ids.size} /> 条
				{canSelectAll ? "，" : null}
			</p>
			{canSelectAll ? (
				<Button onClick={selectAllMatching} size="sm" variant="link">
					选择全部 <Count value={total} /> 条符合筛选的用例
				</Button>
			) : null}
		</>
	);
}
