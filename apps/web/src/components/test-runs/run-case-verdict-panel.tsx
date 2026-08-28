/**
 * 「执行结论」：这一栏**最前面**的那块可收起面板。
 *
 * ## 为什么在最前面
 *
 * 用户原话：「执行结论要放到最前面，而不是最后面，然后是一个可以收起的面板，
 * 你为什么要自己做一个测试结论呢？」。原先这一栏是「抬头 + 我自己攒的『测试结论：
 * xxxx』摘要 + 缺陷 + 附件 …… 用例正文 …… 步骤 …… 真正的执行结论段」——判定入口
 * 在最底下，而顶上那条摘要是凭空多出来的第二个「结论」。现在只剩这一块：
 * 真正的执行结论段整体搬到抬头正下方，那条自造摘要连同它的组件一起删了。
 *
 * ## 这一块里装的是「这次执行」的全部
 *
 * 判定按钮（或分步说明）、说明、缺陷、附件都在里面，而且都遵守同一条读 / 改态规则
 * （`useVerdictEditingMode`）：结果页面上只显示真有内容的东西，修改页面上才出现
 * 输入框与上传区。缺陷和附件不再是各带标题的独立模块——用户两次说过不要。
 *
 * ## 收起来之后还看得见什么
 *
 * 折叠条上只剩标题，结论徽章挪掉了——正上方用例名那一行常驻着同一颗徽章，
 * 收起状态不会因此丢信息。用例正文与步骤本来就在下面，收起这一块正是为了
 * 把它们拉近。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { ChevronDownIcon } from "lucide-react";

import { RunAttachments } from "@/components/test-runs/run-attachments";
import { RunCaseLastVerdict } from "@/components/test-runs/run-case-events";
import { VerdictBody } from "@/components/test-runs/run-case-verdict-body";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictComment } from "@/components/test-runs/run-verdict-comment";
import { VERDICT_SHORTCUT_KEYS } from "@/components/test-runs/test-run-meta";

/**
 * 折叠条：标题 + 随开合旋转的箭头。
 *
 * 结论徽章不在这里画——用例名旁边（`run-case-heading.tsx`）已经常驻同一颗
 * 徽章，折叠条上再画一遍只是同一个值在同一屏上的重复。
 *
 * `aria-expanded` 由 base-ui 的 Trigger 自己打在按钮上，这里不重复声明——
 * 手写一份就多一份会和真实开合状态失配的可能。
 */
function VerdictPanelTrigger() {
	return (
		<CollapsibleTrigger
			render={
				<Button className="w-full justify-start" type="button" variant="ghost">
					<ChevronDownIcon
						aria-hidden="true"
						className="transition-transform group-data-open/run-verdict:rotate-180"
						data-icon="inline-start"
					/>
					<span className="font-medium text-sm">执行结论</span>
				</Button>
			}
		/>
	);
}

interface VerdictPanelNotesProps {
	canConclude: boolean;
	hasSteps: boolean;
	locked: boolean;
}

/** 面板顶部两句提示：待评审阶段的说明，以及非分步形态的快捷键说明。 */
function VerdictPanelNotes({
	canConclude,
	hasSteps,
	locked,
}: VerdictPanelNotesProps) {
	return (
		<>
			{!(canConclude || locked) && (
				<p className="text-muted-foreground text-sm">
					该测试任务还在待评审阶段，评审完成后才能打结论；现在可以增删用例。
				</p>
			)}
			{/*
			 * 快捷键提示的显隐条件仍然是 `canConclude && !hasSteps`，**没有**跟着
			 * 读 / 改态走：P/F/B/S 是在页面一层（`run-execution-state.ts`）注册的，
			 * 那里看不见本面板的读 / 改态，按键在结果页面上照样生效。提示藏起来而键
			 * 还活着，就成了一个按下去会悄悄改写结论的隐形快捷键——比多显示一行糟得多。
			 */}
			{canConclude && !hasSteps ? (
				<p className="text-muted-foreground text-xs">
					快捷键 {VERDICT_SHORTCUT_KEYS.passed} / {VERDICT_SHORTCUT_KEYS.failed}{" "}
					/ {VERDICT_SHORTCUT_KEYS.blocked} / {VERDICT_SHORTCUT_KEYS.skipped}
					，通过/跳过自动跳下一条，失败/阻塞留在本条填写说明
				</p>
			) : null}
		</>
	);
}

export interface RunCaseVerdictPanelProps {
	canConclude: boolean;
	/** 结果页面 / 修改页面，由 `useVerdictEditingMode` 给出（已含一票否决）。 */
	editing: boolean;
	/** 有步骤的用例走分步判定，这里不给四颗按钮。 */
	hasSteps: boolean;
	item: RunCaseDetail;
	/** 已提交：与「待评审」区分开，只用来决定要不要说那句待评审的话。 */
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	onStorageUnavailable: () => void;
	projectId: string;
	storageUnavailable: boolean;
}

interface VerdictEvidenceProps {
	editing: boolean;
	onStorageUnavailable: () => void;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	storageUnavailable: boolean;
}

/**
 * 这次执行留下的证据：缺陷与附件。
 *
 * 拆出来是为了压住 `VerdictPanelBody` 的行数，但切口不是随便找的——这两块共用
 * 同一条规则：**结果页面上有内容才出现，没有就整块不渲染；修改页面上一律给入口**。
 * 上面那几块（提示 / 谁判的 / 判定入口 / 说明）各有各的显隐条件，跟它们不是一类。
 *
 * 两块都自己决定显不显示（`RunDefectPanel` 看有没有关联，`RunAttachments` 看列表
 * 长度——只有它查得到有几条），所以这里不包边框也不加标题：外面套一层就得先知道
 * 「里面到底有没有东西」，而附件那一条谁也替不了它回答。
 */
function VerdictEvidence({
	editing,
	onStorageUnavailable,
	projectId,
	runCase,
	storageUnavailable,
}: VerdictEvidenceProps) {
	return (
		<>
			<RunDefectPanel
				defectKey={runCase.defectKey}
				defectStatus={runCase.defectStatus}
				defectTitle={runCase.defectTitle}
				defectUrl={runCase.defectUrl}
				editing={editing}
				projectId={projectId}
				runCaseId={runCase.id}
			/>
			<RunAttachments
				editing={editing}
				onStorageUnavailable={onStorageUnavailable}
				runCaseId={runCase.id}
				storageUnavailable={storageUnavailable}
			/>
		</>
	);
}

interface VerdictPanelDecisionProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}

/**
 * 结论本身：判定入口 + 说明。
 *
 * 判定入口只在修改页面出现——结果页面上「判成了什么」已经写在用例名旁边的
 * 徽章上，再摆一排按钮既多余又容易误触（尤其是分步形态下，用例级按钮会把
 * 逐步判定盖掉，那条不变量见 `run-case-verdict-body.tsx`）。
 *
 * 说明两态都渲染，因为它两态**长得不一样**：结果页面是一段可选可复制的文字、
 * 空就不画，修改页面才是 textarea。这个二选一由 `VerdictComment` 自己完成，
 * 它同时看得见本地草稿，是唯一能判断「有没有还没保存的字」的地方。
 */
function VerdictPanelDecision({
	canConclude,
	editing,
	hasSteps,
	onCommentSave,
	onPick,
	runCase,
}: VerdictPanelDecisionProps) {
	return (
		<>
			{editing ? (
				<VerdictBody
					canConclude={canConclude}
					hasSteps={hasSteps}
					onPick={onPick}
					runCase={runCase}
				/>
			) : null}
			<VerdictComment
				comment={runCase.comment}
				editable={editing && !hasSteps}
				onCommentSave={onCommentSave}
				result={runCase.result}
				runCaseId={runCase.id}
			/>
		</>
	);
}

/**
 * 面板内容：提示 → 谁判的 → 判定入口 → 说明 → 缺陷 → 附件。
 *
 * 「最后是谁、几点判的」两态都显示：这是看一条用例时第一个要问的问题，
 * 而它本来就是只读信息。完整来龙去脉在本面板底部的「判定记录」里。
 */
function VerdictPanelBody({
	canConclude,
	editing,
	hasSteps,
	item,
	locked,
	onCommentSave,
	onPick,
	onStorageUnavailable,
	projectId,
	storageUnavailable,
}: RunCaseVerdictPanelProps) {
	const { executedByName, runCase } = item;
	return (
		<div className="flex flex-col gap-3 pb-2">
			<VerdictPanelNotes
				canConclude={canConclude}
				hasSteps={hasSteps}
				locked={locked}
			/>
			<RunCaseLastVerdict
				executedAt={runCase.executedAt}
				executedByName={executedByName}
				result={runCase.result}
			/>
			<VerdictPanelDecision
				canConclude={canConclude}
				editing={editing}
				hasSteps={hasSteps}
				onCommentSave={onCommentSave}
				onPick={onPick}
				runCase={runCase}
			/>
			<VerdictEvidence
				editing={editing}
				onStorageUnavailable={onStorageUnavailable}
				projectId={projectId}
				runCase={runCase}
				storageUnavailable={storageUnavailable}
			/>
		</div>
	);
}

/**
 * 默认**展开**。
 *
 * 收起是给「这条已经判完了，我只想往下看步骤」准备的顺手动作，不是常态：默认收起
 * 的话，一条还没判的用例打开时看不到任何判定入口，用户得先点一下折叠条才能开始
 * 干活——正是这次要消灭的那类多余点击。
 *
 * 开合状态不必持久化：面板由 `key={selected.runCase.id}` 挂着（见
 * `run-execution-layout.tsx`），切用例本来就会重挂，收起只在当前这条上有效。
 * 想把「我习惯收起来」记住，那是另一件事，得先有人真的提。
 */
export function RunCaseVerdictPanel(props: RunCaseVerdictPanelProps) {
	return (
		// group/run-verdict 挂在根上：data-open 打在这里，箭头用具名 group 变体旋转。
		<Collapsible className="group/run-verdict flex flex-col" defaultOpen>
			<VerdictPanelTrigger />
			{/* padding 内移到内层容器：height: 0 压不住 padding，留在面板上会在收起
			    过程中露出一条空白带（同 `run-case-events.tsx`）。 */}
			<CollapsibleContent className="collapsible-panel">
				<VerdictPanelBody {...props} />
			</CollapsibleContent>
		</Collapsible>
	);
}
