/**
 * 测试任务执行台（plan §7.3）。
 *
 * 左边用例清单、右边用例内容 + 结论区，选中哪条只改 URL 的 `runCaseId`，
 * 不换页——这样刷新、后退、把链接发给同事都能停在同一条上。
 *
 * 权限只有三档，全部由 `runPermissions()` 从状态推出来，本文件不再二次判断：
 * `pending_review` 能增删用例但不能打结论；`ready` / `in_progress` /
 * **`completed`** 完全相同（已完成**不是**只读，改结论、回退、追加一律直接允许，
 * 不加二次确认）；`submitted` 全只读。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { AddRunCasesSheet } from "@/components/test-runs/add-run-cases-sheet";
import { RunCaseList } from "@/components/test-runs/run-case-list";
import { RunCasePanel } from "@/components/test-runs/run-case-panel";
import { RunEvents } from "@/components/test-runs/run-events";
import { RunExecutionHeader } from "@/components/test-runs/run-execution-header";
import {
	DEFAULT_RUN_CASE_FILTER,
	filterRunCases,
	moduleOptionsOf,
	nextRunCaseId,
	type RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import { RunLockedBanner } from "@/components/test-runs/run-locked-banner";
import {
	countResults,
	runPermissions,
} from "@/components/test-runs/test-run-meta";
import { useAttachmentStorageStatus } from "@/components/test-runs/use-attachment-upload";
import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";
import {
	useAssignRunCases,
	useBulkSetRunCaseResult,
	useRemoveRunCases,
	useSaveRunCaseComment,
	useSetRunCaseResult,
} from "@/components/test-runs/use-test-run-mutations";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

export interface RunExecutionViewProps {
	onSelectRunCase: (runCaseId: string | undefined) => void;
	projectId: string;
	runId: string;
	/** 当前选中的用例行，来自 URL。 */
	selectedRunCaseId: string | undefined;
}

/** 勾选集：批量操作用。切换筛选不清空，理由同 `case-picker` 的跨筛选累积。 */
function useCheckedIds() {
	const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());
	const toggle = useCallback((runCaseId: string) => {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (next.has(runCaseId)) {
				next.delete(runCaseId);
			} else {
				next.add(runCaseId);
			}
			return next;
		});
	}, []);
	const clear = useCallback(() => setCheckedIds(new Set()), []);
	return { checkedIds, clear, setCheckedIds, toggle };
}

export function RunExecutionView({
	onSelectRunCase,
	projectId,
	runId,
	selectedRunCaseId,
}: RunExecutionViewProps) {
	const detailQuery = useSuspenseQuery(
		orpc.testRuns.get.queryOptions({ input: { runId } })
	);
	const { cases, run, submittedByName } = detailQuery.data;
	const { user } = useSession();
	const permissions = runPermissions(run.status);

	const [filter, setFilter] = useState<RunCaseFilter>(DEFAULT_RUN_CASE_FILTER);
	const [addOpen, setAddOpen] = useState(false);
	/**
	 * 附件存储可不可用，两条来源，**取并集**：
	 *
	 * 1. 进页面就查一次 `storageStatus`（`configured: false` = 服务端没配 R2）。
	 *    这条是主路径：上传入口从第一次渲染起就是禁用 + 写明原因的，
	 *    用户不必先失败一次才知道。
	 * 2. 撞到 `PRECONDITION_FAILED` 时置的本地标志。这条兜底保留——
	 *    配置可能在页面开着的时候被管理员改掉，那时第 1 条的结果已经是旧的。
	 *
	 * 标志提在页面这一层而不是附件组件里：它是整个部署的配置状态，与用例无关，
	 * 放在组件里会在每次切用例时被重置，于是用户每换一条用例都得再撞一次那条错误。
	 *
	 * 查询还没回来时（`data === undefined`）**不当作不可用**：那会让上传入口
	 * 在首帧先灰一下再亮起来，比晚知道半秒更糟。
	 */
	const storageStatusQuery = useAttachmentStorageStatus();
	const [storageFailed, setStorageFailed] = useState(false);
	const markStorageUnavailable = useCallback(() => setStorageFailed(true), []);
	const storageUnavailable =
		storageFailed || storageStatusQuery.data?.configured === false;
	const {
		checkedIds,
		clear: clearChecked,
		setCheckedIds,
		toggle,
	} = useCheckedIds();

	const visibleCases = useMemo(
		() => filterRunCases(cases, filter, user?.id ?? null),
		[cases, filter, user?.id]
	);
	const moduleOptions = useMemo(() => moduleOptionsOf(cases), [cases]);
	const counts = useMemo(
		() => countResults(cases.map((item) => item.runCase.result)),
		[cases]
	);

	/** 选中条：URL 上那条若被筛掉或已移出，退回可见列表的第一条。 */
	const selected =
		visibleCases.find((item) => item.runCase.id === selectedRunCaseId) ??
		visibleCases[0] ??
		null;

	// 协作 presence：上报「我在看哪条用例」，与用例列表页共用同一套。
	// isEditing 恒为 false——执行台改的是结论，不是用例内容本身。
	useCasePresence(selected?.testCase.id ?? null, false);

	const setResult = useSetRunCaseResult();
	const saveComment = useSaveRunCaseComment();
	const bulkSetResult = useBulkSetRunCaseResult();
	const removeCases = useRemoveRunCases();
	const assign = useAssignRunCases();

	/** 打结论后自动跳到（筛选后的）下一条；到末尾就停在原地。 */
	const handleVerdict = useCallback(
		(result: TestRunCaseResult) => {
			if (selected === null) {
				return;
			}
			setResult.mutate({ result, runCaseId: selected.runCase.id });
			const next = nextRunCaseId(visibleCases, selected.runCase.id);
			if (next !== null) {
				onSelectRunCase(next);
			}
		},
		[onSelectRunCase, selected, setResult, visibleCases]
	);

	/** 打回未测：**不跳下一条**，因为这多半是发现刚才打错了，人要留在原地。 */
	const handleReset = useCallback(() => {
		if (selected !== null) {
			setResult.mutate({ result: "untested", runCaseId: selected.runCase.id });
		}
	}, [selected, setResult]);

	const handleCommentSave = useCallback(
		(comment: string | null) => {
			if (selected !== null) {
				saveComment.mutate({
					comment,
					result: selected.runCase.result,
					runCaseId: selected.runCase.id,
				});
			}
		},
		[saveComment, selected]
	);

	const handleSelect = useCallback(
		(nextId: string) => onSelectRunCase(nextId),
		[onSelectRunCase]
	);

	const handleToggleAll = useCallback(() => {
		setCheckedIds((prev) =>
			prev.size === visibleCases.length && visibleCases.length > 0
				? new Set()
				: new Set(visibleCases.map((item) => item.runCase.id))
		);
	}, [setCheckedIds, visibleCases]);

	const handleBulkPass = useCallback(() => {
		bulkSetResult.mutate(
			{ result: "passed", runCaseIds: [...checkedIds], runId },
			{ onSuccess: clearChecked }
		);
	}, [bulkSetResult, checkedIds, clearChecked, runId]);

	const handleRemoveCases = useCallback(() => {
		removeCases.mutate(
			{ runCaseIds: [...checkedIds], runId },
			{ onSuccess: clearChecked }
		);
	}, [checkedIds, clearChecked, removeCases, runId]);

	/*
	 * 只提供「指派给我 / 取消指派」，没有成员下拉：成员名单接口
	 * （`users.list`）是 adminProcedure，普通成员拉不动，做一个只有管理员
	 * 能用的下拉会让大多数人看到一个空列表。这条限制已写进交付报告。
	 */
	const handleAssignToMe = useCallback(() => {
		if (user !== null) {
			assign.mutate(
				{ assigneeId: user.id, runCaseIds: [...checkedIds], runId },
				{ onSuccess: clearChecked }
			);
		}
	}, [assign, checkedIds, clearChecked, runId, user]);

	const openAdd = useCallback(() => setAddOpen(true), []);
	const closeAdd = useCallback(() => setAddOpen(false), []);

	useRunShortcuts({
		enabled: permissions.canConclude && selected !== null,
		onVerdict: handleVerdict,
	});

	return (
		<div className="flex min-h-0 flex-col">
			{permissions.locked && run.submittedAt !== null && (
				/*
				 * 三个值原样往下传：横幅要用 `submittedBy`（uuid）判「是不是系统
				 * 自动提交」，用 `submittedByName` 显示人名。两者不能互相替代，
				 * 理由见 RunLockedBannerProps 上的注释。
				 */
				<RunLockedBanner
					submittedAt={run.submittedAt}
					submittedBy={run.submittedBy}
					submittedByName={submittedByName}
				/>
			)}
			<RunExecutionHeader
				counts={{ ...counts, total: cases.length }}
				projectId={projectId}
				run={run}
			/>
			<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-run-execution">
				<RunCaseList
					allCases={cases}
					canConclude={permissions.canConclude}
					canEditCases={permissions.canEditCases}
					cases={visibleCases}
					checkedIds={checkedIds}
					filter={filter}
					moduleOptions={moduleOptions}
					onAddCases={openAdd}
					onAssignToMe={handleAssignToMe}
					onBulkPass={handleBulkPass}
					onFilterChange={setFilter}
					onRemoveCases={handleRemoveCases}
					onSelect={handleSelect}
					onToggleAll={handleToggleAll}
					onToggleChecked={toggle}
					selectedRunCaseId={selected?.runCase.id ?? null}
				/>
				<div className="min-h-0 overflow-y-auto">
					{selected === null ? (
						<p className="p-8 text-center text-muted-foreground text-sm">
							这个测试任务里还没有用例，先追加几条再开始测。
						</p>
					) : (
						<RunCasePanel
							canConclude={permissions.canConclude}
							item={selected}
							key={selected.runCase.id}
							locked={permissions.locked}
							onCommentSave={handleCommentSave}
							onPick={handleVerdict}
							onReset={handleReset}
							onStorageUnavailable={markStorageUnavailable}
							projectId={projectId}
							storageUnavailable={storageUnavailable}
						/>
					)}
				</div>
			</div>
			<RunEvents runId={run.id} />
			<AddRunCasesSheet
				onClose={closeAdd}
				open={addOpen}
				projectId={projectId}
				runId={run.id}
			/>
		</div>
	);
}
