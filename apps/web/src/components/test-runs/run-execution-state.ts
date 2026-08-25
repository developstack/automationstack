/**
 * 执行台的页面级状态：把详情数据、筛选、勾选、写操作串成一份给 JSX 直接用的形状。
 *
 * 这一层唯一的硬约束是 **hook 的调用顺序**。下面几个自定义 hook 内部装着的，
 * 正是从前平铺在 `RunExecutionView` 里的那一串 hook，逐个对应、顺序一字不差。
 * React 靠调用顺序认领每个 hook 的 state，调换任意两行都会让 state 张冠李戴，
 * 所以这里既不按「读起来更顺」重排，也不要在中间插入新的 hook——要加就加在末尾，
 * 或者加进它该属于的那个自定义 hook 里。
 *
 * 返回值按来源分组（`data` / `selection` / `checked` / `verdict` / `bulk` /
 * `storage`），而不是摊平成二十几个字段：分组边界与自定义 hook 的边界重合，
 * 加一个字段时只用改产它的那个 hook 和用它的那一行，不必再从 view 一路穿下去。
 */
import type { PublicUser } from "@automationstack/db/schema/users";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useState,
} from "react";

import { useSession } from "@/components/auth/use-session";
import {
	type RunBulkHandlers,
	type RunVerdictHandlers,
	useRunBulkHandlers,
	useRunCaseMutations,
	useRunVerdictHandlers,
} from "@/components/test-runs/run-execution-handlers";
import {
	DEFAULT_RUN_CASE_FILTER,
	type RunCaseDetail,
	type RunCaseFilter,
	type TestRunDetailView,
} from "@/components/test-runs/run-execution-meta";
import {
	type CheckedIds,
	type RunCaseSelection,
	useCheckedIds,
	useRunCaseSelection,
} from "@/components/test-runs/run-execution-selection";
import {
	type RunPermissions,
	runPermissions,
} from "@/components/test-runs/test-run-meta";
import { useAttachmentStorageStatus } from "@/components/test-runs/use-attachment-upload";
import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

export interface RunAttachmentStorage {
	markUnavailable: () => void;
	unavailable: boolean;
}

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
 * 本 hook 因此只能在页面这一级调用一次，不要下放到右栏里去。
 *
 * 查询还没回来时（`data === undefined`）**不当作不可用**：那会让上传入口
 * 在首帧先灰一下再亮起来，比晚知道半秒更糟。
 */
export function useRunAttachmentStorage(): RunAttachmentStorage {
	const storageStatusQuery = useAttachmentStorageStatus();
	const [storageFailed, setStorageFailed] = useState(false);
	const markUnavailable = useCallback(() => setStorageFailed(true), []);
	return {
		markUnavailable,
		unavailable: storageFailed || storageStatusQuery.data?.configured === false,
	};
}

export interface RunExecutionData {
	cases: readonly RunCaseDetail[];
	/**
	 * 左栏筛选条件。跟数据放在同一份里，是因为它决定了下游每一个派生量的口径：
	 * 可见清单、「下一条」是谁、批量操作作用在哪些行，全都以它为准。
	 * 把它单独提到别处，只会让「手上这份 cases 是筛过的还是全量的」
	 * 在每个调用点重问一遍。
	 */
	filter: RunCaseFilter;
	permissions: RunPermissions;
	run: TestRunDetailView["run"];
	setFilter: Dispatch<SetStateAction<RunCaseFilter>>;
	submittedByName: TestRunDetailView["submittedByName"];
	user: PublicUser | null;
}

/**
 * 执行台的数据源：详情查询 + 当前会话 + 筛选条件。
 *
 * 权限只有三档，全部由 `runPermissions()` 从状态推出来，这一层不再二次判断；
 * `runPermissions` 是纯函数，每次渲染重算比记忆化便宜。
 */
export function useRunExecutionData(runId: string): RunExecutionData {
	const detailQuery = useSuspenseQuery(
		orpc.testRuns.get.queryOptions({ input: { runId } })
	);
	const { cases, run, submittedByName } = detailQuery.data;
	const { user } = useSession();
	const [filter, setFilter] = useState<RunCaseFilter>(DEFAULT_RUN_CASE_FILTER);
	return {
		cases,
		filter,
		permissions: runPermissions(run.status),
		run,
		setFilter,
		submittedByName,
		user,
	};
}

export interface RunExecutionOptions {
	onSelectRunCase: (runCaseId: string | undefined) => void;
	runId: string;
	/** 当前选中的用例行，来自 URL。 */
	selectedRunCaseId: string | undefined;
}

export interface RunExecutionState {
	addOpen: boolean;
	bulk: RunBulkHandlers;
	checked: CheckedIds;
	data: RunExecutionData;
	onCloseAdd: () => void;
	onOpenAdd: () => void;
	selection: RunCaseSelection;
	storage: RunAttachmentStorage;
	verdict: RunVerdictHandlers;
}

export function useRunExecution(
	options: RunExecutionOptions
): RunExecutionState {
	const { onSelectRunCase, runId, selectedRunCaseId } = options;
	const data = useRunExecutionData(runId);
	const [addOpen, setAddOpen] = useState(false);
	const storage = useRunAttachmentStorage();
	const checked = useCheckedIds();
	const selection = useRunCaseSelection({
		cases: data.cases,
		filter: data.filter,
		selectedRunCaseId,
		user: data.user,
	});

	// 协作 presence：上报「我在看哪条用例」，与用例列表页共用同一套。
	// isEditing 恒为 false——执行台改的是结论，不是用例内容本身。
	useCasePresence(selection.selectedTestCaseId, false);

	const mutations = useRunCaseMutations();
	const verdict = useRunVerdictHandlers({
		mutations,
		onSelectRunCase,
		selection,
	});
	const bulk = useRunBulkHandlers({
		checked,
		mutations,
		runId,
		selection,
		user: data.user,
	});
	const openAdd = useCallback(() => setAddOpen(true), []);
	const closeAdd = useCallback(() => setAddOpen(false), []);

	/** 没有可打结论的行时整套快捷键都不挂，免得空按一下什么都不发生。 */
	const canUseShortcuts =
		data.permissions.canConclude && selection.selected !== null;
	useRunShortcuts({
		enabled: canUseShortcuts,
		onVerdict: verdict.handleVerdict,
	});

	return {
		addOpen,
		bulk,
		checked,
		data,
		onCloseAdd: closeAdd,
		onOpenAdd: openAdd,
		selection,
		storage,
		verdict,
	};
}
