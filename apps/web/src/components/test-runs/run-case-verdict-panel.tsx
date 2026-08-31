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

import { RunCaseLastVerdict } from "@/components/test-runs/run-case-last-verdict";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictEvidence } from "@/components/test-runs/verdict-evidence";
import { VerdictPanelDecision } from "@/components/test-runs/verdict-panel-decision";
import { VerdictPanelNotes } from "@/components/test-runs/verdict-panel-notes";

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
				editing={editing}
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
