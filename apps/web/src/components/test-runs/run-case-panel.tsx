/**
 * 执行台右栏：抬头 → 执行结论 → 用例正文 → 步骤与判定 → 判定记录。
 *
 * 用例内容来自后端的 `innerJoin test_cases`，是**当前**内容而不是创建测试任务时的快照
 * （D2：用例永远只有一份）。所以这里不做任何本地缓存或版本对比——别人改了用例，
 * 第一期已有的 `case` 失效事件会把这一页刷新到最新。
 *
 * ## 顺序就是这次返工的主体
 *
 * 用户原话：「执行结论要放到最前面，而不是最后面，然后是一个可以收起的面板」。
 * 原先的排法是「抬头 + 自造的结论摘要 + 缺陷 + 附件 …… 正文 …… 步骤 …… 真正的
 * 执行结论段 …… 流水」：判定入口在最底下，顶上那条摘要还是凭空多出来的第二个
 * 「结论」。现在这次执行的全部东西（判定 / 说明 / 缺陷 / 附件）都收进抬头正下方
 * 那块可收起的执行结论面板，用例本身的内容跟在它后面，流水仍在最底部。
 *
 * 判定入口离步骤远了，这是**取舍**：人是照着步骤打结论的，但收起面板只要点一下，
 * 而原先那种「滚到底才找得到入口」每条用例都要付一次。
 *
 * 本文件只剩「这一栏由哪几段、按什么顺序组成」；各段的具体画法在
 * `run-case-content.tsx`、`run-case-steps-block.tsx`、`run-case-heading.tsx`
 * 与 `run-case-verdict-panel.tsx`。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { RunCaseContent } from "@/components/test-runs/run-case-content";
import { RunCaseEvents } from "@/components/test-runs/run-case-events";
import { RunCaseHeading } from "@/components/test-runs/run-case-heading";
import { RunCaseStepsBlock } from "@/components/test-runs/run-case-steps-block";
import { RunCaseVerdictPanel } from "@/components/test-runs/run-case-verdict-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	useVerdictEditingMode,
	type VerdictEditingMode,
} from "@/components/test-runs/run-verdict-editing-mode";
import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";
import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";

interface RunCaseBodyProps {
	editingMode: VerdictEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}

/** 用例本身的内容 + 本条用例的时间线。 */
function RunCaseBody({
	editingMode,
	hasSteps,
	imageUrls,
	item,
}: RunCaseBodyProps) {
	return (
		<>
			<RunCaseContent imageUrls={imageUrls} testCase={item.testCase} />
			<RunCaseStepsBlock
				editingMode={editingMode}
				hasSteps={hasSteps}
				imageUrls={imageUrls}
				item={item}
			/>
			{/*
			 * 用例级的时间线放在本面板最底部（不是页面底部——页面底部那份是
			 * 任务级的「变更历史」）。切用例时整个面板带 key 重建，
			 * 加上 query key 里带 runCaseId，不会短暂显示上一条的历史。
			 */}
			<RunCaseEvents runCaseId={item.runCase.id} />
		</>
	);
}

export interface RunCasePanelProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	/** 把结论打回「未测」。已完成的测试任务同样允许（plan §2.2）。 */
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	storageUnavailable: boolean;
}

/**
 * 这条用例判过没有——读 / 改态的初值就看它。
 *
 * 两种形态问的不是同一个字段：分步形态看有没有保存过分步结果（`runCase.result`
 * 是由它们推导出来的，判据只能是源头），非分步形态看结论本身还是不是「未测」。
 */
function hasVerdictOf(item: RunCaseDetail, hasSteps: boolean): boolean {
	const { runCase } = item;
	if (hasSteps) {
		return runCase.stepResults.length > 0;
	}
	return runCase.result !== "untested";
}

interface CaseVerdictEntryOptions {
	canConclude: boolean;
	item: RunCaseDetail;
	onPick: (result: TestRunCaseResult) => void;
}

/**
 * 这一栏的两件事，**绑在一起**：读 / 改态，以及 P / F / B / S 的监听。
 *
 * ## 形态
 *
 * 有没有步骤，决定这一栏是「逐步判定」还是「整条判定」两种形态之一。判据是
 * **用例当前的步骤**，不是 `runCase.stepResults` 有没有值：用例是活引用（D2），
 * 一条本来没步骤、后来补上步骤的用例必须立刻切到分步形态，而它此刻的
 * `stepResults` 还是空的。反过来看 stepResults 会把这种用例永远钉在四颗按钮上，
 * 且没有任何办法脱出。
 *
 * ## 读 / 改态住在这一层
 *
 * 它原先私有于 `RunStepsSection`、只管步骤那一屏，现在管的是整个执行结论面板
 * （判定 / 说明 / 缺陷 / 附件都按它切结果页面与修改页面）。而「修改」按钮在抬头上，
 * 抬头、执行结论面板、步骤那一段互为**兄弟节点**——同一份状态只能由共同的父节点
 * 拿着。三条语义原样保留在 `useVerdictEditingMode` 里，其中「草稿恢复强制进改态」
 * 那条仍落在 `RunStepsSection` 内部，因为只有那里看得见 `dirty`。
 *
 * ## 快捷键为什么也在这里
 *
 * 它原先挂在页面一层（`run-execution-state.ts`），开关是另写的一条式子
 * （`canConclude && selected !== null && steps.length === 0`）。那条式子与四颗结论
 * 按钮的渲染条件只在权限那一半重合，差的正是读 / 改态——而读 / 改态这份 state 只
 * 存在于这里，页面那一层根本看不见它。于是只读态下按钮按权限藏了、键还活着，
 * 按一下 P 就绕过界面上的判定改写了这条用例的结论。
 *
 * 所以监听搬进了产出 `editing` 的这个 hook，开关**只许**调 `canPickCaseVerdict`
 * ——它就是按钮的渲染判据本身，别把它展开成 `editing && !hasSteps`，展开的那一刻
 * 就又有了第二份会各自漂移的判据。原先那条 `selected !== null` 不必再写：
 * `RunCasePanel` 只在选中某条用例时才挂载。
 */
function useCaseVerdictEntry({
	canConclude,
	item,
	onPick,
}: CaseVerdictEntryOptions) {
	const hasSteps = item.testCase.steps.length > 0;
	const editingMode = useVerdictEditingMode(
		hasVerdictOf(item, hasSteps),
		canConclude
	);
	useRunShortcuts({
		enabled: canPickCaseVerdict({ editing: editingMode.editing, hasSteps }),
		onVerdict: onPick,
	});
	return { editingMode, hasSteps };
}

export function RunCasePanel({
	canConclude,
	item,
	locked,
	onCommentSave,
	onPick,
	onReset,
	onStorageUnavailable,
	projectId,
	storageUnavailable,
}: RunCasePanelProps) {
	const { runCase, testCase } = item;
	// 一次请求签完这条用例的全部贴图，正文里的引用按 id 查表；执行台是只读侧，
	// 不套 CaseAttachmentProvider（那边才有粘贴上传）。
	const imageUrls = useCaseAttachmentUrls(testCase.id);
	const { editingMode, hasSteps } = useCaseVerdictEntry({
		canConclude,
		item,
		onPick,
	});

	return (
		<div className="flex flex-col gap-4 p-4">
			<RunCaseHeading
				canConclude={canConclude}
				editing={editingMode.editing}
				onEdit={editingMode.onEdit}
				onReset={onReset}
				projectId={projectId}
				runCase={runCase}
				testCase={testCase}
			/>
			<RunCaseVerdictPanel
				canConclude={canConclude}
				editing={editingMode.editing}
				hasSteps={hasSteps}
				item={item}
				locked={locked}
				onCommentSave={onCommentSave}
				onPick={onPick}
				onStorageUnavailable={onStorageUnavailable}
				projectId={projectId}
				storageUnavailable={storageUnavailable}
			/>
			<RunCaseBody
				editingMode={editingMode}
				hasSteps={hasSteps}
				imageUrls={imageUrls}
				item={item}
			/>
		</div>
	);
}
