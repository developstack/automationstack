import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_BATCH_CASES,
	MAX_FILTER_BATCH_CASES,
} from "@automationstack/api/schemas/case";
import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { CaseBatchBar } from "@/components/cases/case-batch-bar";
import { CaseBatchDeleteButton } from "@/components/cases/case-batch-delete-button";
import { CaseBatchStatusMenu } from "@/components/cases/case-batch-status-menu";
import { CaseBatchSummary } from "@/components/cases/case-batch-summary";
import type { CaseListFilter } from "@/components/cases/case-list-query";
import { useCaseBatchRemove } from "@/components/cases/use-case-batch-remove";
import {
	type CaseSelection,
	caseBatchTarget,
} from "@/components/cases/use-case-selection";
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

/** 批量操作栏的两个操作。选择了全部符合筛选的用例时发送筛选条件，否则发送勾选的 id。 */
function useBatchHandlers(selection: CaseSelection, filter: CaseListFilter) {
	const changeStatus = useCaseBatchStatusChange();
	const remove = useCaseBatchRemove();
	const { pending, run } = usePendingBatchAction(selection.clear);
	const handleChangeStatus = useCallback(
		(status: CaseStatus) =>
			run("status", () =>
				changeStatus(caseBatchTarget(selection, filter), status)
			),
		[changeStatus, filter, run, selection]
	);
	const handleDelete = useCallback(
		() => run("delete", () => remove(caseBatchTarget(selection, filter))),
		[filter, remove, run, selection]
	);
	return { handleChangeStatus, handleDelete, pending };
}

/** 超过一次的上限时，不显示批量操作，显示的提示。没有超过时为 null。 */
function limitHint(
	{ allMatching, ids }: CaseSelection,
	total: number
): string | null {
	if (allMatching) {
		return total > MAX_FILTER_BATCH_CASES
			? FILTER_BATCH_TOO_MANY_MESSAGE
			: null;
	}
	return ids.size > MAX_BATCH_CASES
		? `一次最多处理 ${MAX_BATCH_CASES} 条用例，请减少勾选`
		: null;
}

interface CaseListBatchActionsProps {
	/** 当前的筛选条件。选择了全部符合筛选的用例时，批量操作发送这个筛选条件。 */
	filter: CaseListFilter;
	/** 当前页的用例和符合筛选的总数。当前页全选后才提供「选择全部」。 */
	page: { items: readonly { id: string }[]; total: number };
	selection: CaseSelection;
}

/**
 * 用例列表的批量操作栏：改状态和删除。每个操作一个请求完成。
 * 勾选的用例一次最多 MAX_BATCH_CASES 条；选择了全部符合筛选的用例时发送筛选条件，
 * 最多 MAX_FILTER_BATCH_CASES 条。超过上限时不显示批量操作，显示提示，不拆成多个请求（拆开后不再是一个事务）。
 * 操作成功后清空勾选；失败时保留勾选，可以再试。
 */
export function CaseListBatchActions({
	filter,
	page,
	selection,
}: CaseListBatchActionsProps) {
	const { allMatching, clear, ids } = selection;
	const { total } = page;
	const pageIds = useMemo(
		() => page.items.map((testCase) => testCase.id),
		[page.items]
	);
	const { handleChangeStatus, handleDelete, pending } = useBatchHandlers(
		selection,
		filter
	);

	if (ids.size === 0 && !allMatching) {
		return null;
	}
	const hint =
		pending === null ? limitHint(selection, total) : PENDING_HINTS[pending];
	return (
		<CaseBatchBar
			clearLabel={allMatching ? "取消全部选择" : "取消选择"}
			onClear={clear}
			summary={
				<CaseBatchSummary
					pageIds={pageIds}
					selection={selection}
					total={total}
				/>
			}
		>
			{hint === null ? (
				<>
					<CaseBatchStatusMenu onChange={handleChangeStatus} />
					<CaseBatchDeleteButton
						count={allMatching ? total : ids.size}
						onDelete={handleDelete}
					/>
				</>
			) : (
				<BatchHint>{hint}</BatchHint>
			)}
		</CaseBatchBar>
	);
}
