import { MAX_STATUS_CHANGE_CASES } from "@automationstack/api/schemas/case";
import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { type ReactNode, useCallback, useState } from "react";

import { CaseBatchBar } from "@/components/cases/case-batch-bar";
import { CaseBatchStatusMenu } from "@/components/cases/case-batch-status-menu";
import type { CaseSelection } from "@/components/cases/use-case-selection";
import { useCaseBatchStatusChange } from "@/components/cases/use-case-status-change";

function BatchHint({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground text-xs">{children}</p>;
}

interface CaseListBatchActionsProps {
	selection: CaseSelection;
}

/**
 * 用例列表的批量操作栏。改状态一个请求完成，一次最多 MAX_STATUS_CHANGE_CASES 条：
 * 跨页勾选超过上限时不显示「改状态」，提示减少勾选，不拆成多个请求（拆开后不再是一个事务）。
 * 修改成功后清空勾选，提示中可以撤销。请求完成前不显示「改状态」，不会发出第二个请求。
 */
export function CaseListBatchActions({ selection }: CaseListBatchActionsProps) {
	const { clear, ids } = selection;
	const changeStatus = useCaseBatchStatusChange();
	const [changing, setChanging] = useState(false);
	const handleChangeStatus = useCallback(
		async (status: CaseStatus) => {
			setChanging(true);
			try {
				if (await changeStatus([...ids], status)) {
					clear();
				}
			} finally {
				setChanging(false);
			}
		},
		[changeStatus, clear, ids]
	);

	if (ids.size === 0) {
		return null;
	}
	let statusAction: ReactNode = (
		<CaseBatchStatusMenu onChange={handleChangeStatus} />
	);
	if (changing) {
		statusAction = <BatchHint>正在修改状态…</BatchHint>;
	} else if (ids.size > MAX_STATUS_CHANGE_CASES) {
		statusAction = (
			<BatchHint>
				一次最多修改 {MAX_STATUS_CHANGE_CASES} 条用例的状态，请减少勾选
			</BatchHint>
		);
	}
	return (
		<CaseBatchBar count={ids.size} onClear={clear}>
			{statusAction}
		</CaseBatchBar>
	);
}
