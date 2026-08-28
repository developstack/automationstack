/**
 * 执行台右栏：用例内容（实时）+ 结论 + 说明 + 附件 + 缺陷。
 *
 * 用例内容来自后端的 `innerJoin test_cases`，是**当前**内容而不是创建测试任务时的快照
 * （D2：用例永远只有一份）。所以这里不做任何本地缓存或版本对比——别人改了用例，
 * 第一期已有的 `case` 失效事件会把这一页刷新到最新。
 *
 * ## 这一栏现在分成上下两半
 *
 * 上半是**这次执行**的事：用例名旁边的结论徽章、身份标签、「修改 / 打回未测」、
 * 「测试结论：xxxx」、缺陷、附件。下半是**用例本身**：前置条件、步骤与判定、
 * 判定控件，最后是流水。原先结论摘要、缺陷、附件全堆在最底下，改一条判过的用例
 * 得先滚到底才找得到入口（用户原话）。
 *
 * 判定**控件**（四颗按钮 + 说明框）刻意留在下半：人是照着步骤打结论的，
 * 把它们拽到用例名底下等于要求先滚下去读完步骤、再滚回来点按钮。搬上来的只有
 * 「修改 / 打回未测」这两颗与「刚才判成什么」这条摘要。
 *
 * 本文件只剩「这一栏由哪几段、按什么顺序组成」；各段的具体画法在
 * `run-case-panel-sections.tsx` 与 `run-case-heading.tsx`。这么切是因为原先一个
 * `RunCasePanel` 就 100 行，超了 eslint 的 50 行函数上限，而段与段之间本来就
 * 没有共享状态——唯一的例外是分步判定的编辑态，见下面 `RunCasePanel` 里的注释。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { RunAttachments } from "@/components/test-runs/run-attachments";
import { RunCaseEvents } from "@/components/test-runs/run-case-events";
import { RunCaseHeading } from "@/components/test-runs/run-case-heading";
import {
	RunCaseContent,
	RunCaseDefectSection,
	RunCaseVerdictSection,
	RunCaseVerdictSummary,
} from "@/components/test-runs/run-case-panel-sections";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RunStepsSection,
	type SteppedEditingMode,
	useSteppedEditingMode,
} from "@/components/test-runs/run-steps-section";
import { needsVerdictDetails } from "@/components/test-runs/test-run-meta";

/** 「步骤与判定」那一段，或者「这条用例没有步骤」那一句。 */
function RunCaseStepsBlock({
	editingMode,
	hasSteps,
	imageUrls,
	item,
}: {
	editingMode: SteppedEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}) {
	if (!hasSteps) {
		return <p className="text-muted-foreground text-sm">该用例没有步骤。</p>;
	}
	return (
		<RunStepsSection
			editingMode={editingMode}
			imageUrls={imageUrls}
			item={item}
			/*
			 * 切用例时整段重建：草稿 state 按 runCaseId 存，不带 key 的话
			 * React 会把上一条的 judged / comments 原样留给下一条，
			 * 用户会看到一屏别人的判定。用例改版（currentVersion 变）同样
			 * 重建——那时旧的分步判定已经不指向用户读过的文案了。
			 *
			 * 编辑态**不**跟着这个 key 重置了（它现在住在 `RunCasePanel` 上）：
			 * 用例改版时那句「请对着新步骤重新判定」正需要用户能接着点，
			 * 把他弹回只读态、要求再点一次「修改」是反的。
			 */
			key={`${item.runCase.id}:${item.testCase.currentVersion}`}
		/>
	);
}

interface RunCaseHeadProps {
	canConclude: boolean;
	editingMode: SteppedEditingMode;
	hasSteps: boolean;
	locked: boolean;
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	storageUnavailable: boolean;
	testCase: RunCaseDetail["testCase"];
}

/**
 * 上半：抬头 + 这次执行的结果与它的证据（结论摘要 / 缺陷 / 附件）。
 *
 * 三块各自决定显不显示，这里不做汇总判断：缺陷看 `needsDefectLink` 加它自己的
 * 逃生口，附件看 `relevant` 加列表长度（只有它查得到有几条），摘要看有没有说明。
 * 想在外面包一圈边框就得先知道「里面到底有没有东西」，而附件那一条谁也替不了它
 * 回答——所以三块直接躺在面板的 gap-4 里，分隔线画在下半的「前置条件」上。
 */
function RunCaseHead({
	canConclude,
	editingMode,
	hasSteps,
	locked,
	onReset,
	onStorageUnavailable,
	projectId,
	runCase,
	storageUnavailable,
	testCase,
}: RunCaseHeadProps) {
	return (
		<>
			<RunCaseHeading
				canConclude={canConclude}
				editing={editingMode.editing}
				hasSteps={hasSteps}
				onEdit={editingMode.onEdit}
				onReset={onReset}
				runCase={runCase}
				testCase={testCase}
			/>
			<RunCaseVerdictSummary comment={runCase.comment} />
			<RunCaseDefectSection
				locked={locked}
				projectId={projectId}
				runCase={runCase}
			/>
			<RunAttachments
				locked={locked}
				onStorageUnavailable={onStorageUnavailable}
				relevant={needsVerdictDetails(runCase.result)}
				runCaseId={runCase.id}
				storageUnavailable={storageUnavailable}
			/>
		</>
	);
}

interface RunCaseBodyProps {
	canConclude: boolean;
	editingMode: SteppedEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
}

/** 下半：用例正文 + 步骤与判定 + 判定控件 + 本条用例的时间线。 */
function RunCaseBody({
	canConclude,
	editingMode,
	hasSteps,
	imageUrls,
	item,
	locked,
	onCommentSave,
	onPick,
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
			<RunCaseVerdictSection
				canConclude={canConclude}
				hasSteps={hasSteps}
				item={item}
				locked={locked}
				onCommentSave={onCommentSave}
				onPick={onPick}
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
	/**
	 * 有没有步骤，决定这一栏是「逐步判定」还是「整条判定」两种形态之一。
	 *
	 * 判据是**用例当前的步骤**，不是 `runCase.stepResults` 有没有值：用例是活
	 * 引用（D2），一条本来没步骤、后来补上步骤的用例必须立刻切到分步形态，
	 * 而它此刻的 `stepResults` 还是空的。反过来看 stepResults 会把这种用例
	 * 永远钉在四颗按钮上，且没有任何办法脱出。
	 */
	const hasSteps = testCase.steps.length > 0;
	/**
	 * 分步判定的编辑态**提到这一层**。
	 *
	 * 它原先私有于 `RunStepsSection`，但「修改」已经搬到抬头上，而抬头与步骤那一段
	 * 是兄弟节点——同一份状态只能由共同的父节点拿着。三条语义原样保留在
	 * `useSteppedEditingMode` 里（默认进编辑态、草稿恢复强制进编辑态、
	 * `canConclude` 一票否决），其中第二条仍落在 `RunStepsSection` 内部，
	 * 因为只有那里看得见工作副本的 `dirty`。
	 */
	const editingMode = useSteppedEditingMode(
		runCase.stepResults.length > 0,
		canConclude
	);

	return (
		<div className="flex flex-col gap-4 p-4">
			<RunCaseHead
				canConclude={canConclude}
				editingMode={editingMode}
				hasSteps={hasSteps}
				locked={locked}
				onReset={onReset}
				onStorageUnavailable={onStorageUnavailable}
				projectId={projectId}
				runCase={runCase}
				storageUnavailable={storageUnavailable}
				testCase={testCase}
			/>
			<RunCaseBody
				canConclude={canConclude}
				editingMode={editingMode}
				hasSteps={hasSteps}
				imageUrls={imageUrls}
				item={item}
				locked={locked}
				onCommentSave={onCommentSave}
				onPick={onPick}
			/>
		</div>
	);
}
