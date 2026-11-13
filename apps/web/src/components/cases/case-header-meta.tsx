import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { HintTooltip } from "@/components/interaction/hint-tooltip";
import { StatusBadge } from "@/components/status/status-badge";

const CASE_NUMBER_LENGTH = 8;

/**
 * 用例没有单独的编号字段。界面上的用例编号是用例 ID 的前 8 位，
 * 完整的 ID 放在 Tooltip 中。
 */
export function formatCaseNumber(caseId: string): string {
	return caseId.slice(0, CASE_NUMBER_LENGTH);
}

interface CaseHeaderMetaProps {
	caseId: string;
	priority: CasePriority;
	status: CaseStatus;
}

/** 详情面板和新建面板头部的第一行：用例编号、用例状态和优先级。 */
export function CaseHeaderMeta({
	caseId,
	priority,
	status,
}: CaseHeaderMetaProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="eyebrow">用例编号</span>
			<HintTooltip label={caseId}>
				<span className="numeric text-muted-foreground text-xs">
					{formatCaseNumber(caseId)}
				</span>
			</HintTooltip>
			<StatusBadge kind="caseStatus" value={status} />
			<StatusBadge kind="priority" value={priority} />
		</div>
	);
}
