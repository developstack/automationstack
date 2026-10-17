import { MAX_BATCH_CASES } from "@automationstack/api/schemas/case";
import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { type ReactNode, useCallback, useState } from "react";

import { CaseBatchBar } from "@/components/cases/case-batch-bar";
import { CaseBatchDeleteButton } from "@/components/cases/case-batch-delete-button";
import { CaseBatchStatusMenu } from "@/components/cases/case-batch-status-menu";
import { useCaseBatchRemove } from "@/components/cases/use-case-batch-remove";
import type { CaseSelection } from "@/components/cases/use-case-selection";
import { useCaseBatchStatusChange } from "@/components/cases/use-case-status-change";

function BatchHint({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground text-xs">{children}</p>;
}

/** 正在进行的批量操作。请求完成前不显示任何批量操作，不会发出第二个请求。 */
type PendingAction = "delete" | "status" | null;

const PENDING_HINTS: Record<NonNullable<PendingAction>, string> = {
	delete: "正在删除…",
	status: "正在修改状态…",
};

/**
 * 运行一个批量操作：请求期间记录正在进行的操作，成功后清空勾选。
 * request 返回是否成功；失败时保留勾选。
 */
function usePendingBatchAction(clear: () => void) {
	const [pending, setPending] = useState<PendingAction>(null);
	const run = useCallback(
		async (
			action: NonNullable<PendingAction>,
			request: () => Promise<boolean>
		) => {
			setPending(action);
			try {
				if (await request()) {
					clear();
				}
			} finally {
				setPending(null);
			}
		},
		[clear]
	);
	return { pending, run };
}

interface CaseListBatchActionsProps {
	selection: CaseSelection;
}

/**
 * 用例列表的批量操作栏：改状态和删除。每个操作一个请求完成，一次最多 MAX_BATCH_CASES 条：
 * 跨页勾选超过上限时不显示批量操作，提示减少勾选，不拆成多个请求（拆开后不再是一个事务）。
 * 操作成功后清空勾选；失败时保留勾选，可以再试。
 */
export function CaseListBatchActions({ selection }: CaseListBatchActionsProps) {
	const { clear, ids } = selection;
	const changeStatus = useCaseBatchStatusChange();
	const remove = useCaseBatchRemove();
	const { pending, run } = usePendingBatchAction(clear);
	const handleChangeStatus = useCallback(
		(status: CaseStatus) => run("status", () => changeStatus([...ids], status)),
		[changeStatus, ids, run]
	);
	const handleDelete = useCallback(
		() => run("delete", () => remove([...ids])),
		[ids, remove, run]
	);

	if (ids.size === 0) {
		return null;
	}
	let actions: ReactNode = (
		<>
			<CaseBatchStatusMenu onChange={handleChangeStatus} />
			<CaseBatchDeleteButton count={ids.size} onDelete={handleDelete} />
		</>
	);
	if (pending !== null) {
		actions = <BatchHint>{PENDING_HINTS[pending]}</BatchHint>;
	} else if (ids.size > MAX_BATCH_CASES) {
		actions = (
			<BatchHint>一次最多处理 {MAX_BATCH_CASES} 条用例，请减少勾选</BatchHint>
		);
	}
	return (
		<CaseBatchBar count={ids.size} onClear={clear}>
			{actions}
		</CaseBatchBar>
	);
}
