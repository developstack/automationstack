/**
 * 有步骤的用例，「结论」那一段长什么样。
 *
 * 从 `run-case-panel-sections.tsx` 拆出来：那个文件是「一条用例的各段怎么画」的
 * 集合，而这里讲的是同一件事——分步判定上线后，用例级结论变成只读的推导结果。
 * 放在一起，将来要改「结论从哪来」的人一眼能看全，不用在一个三百行的文件里翻。
 *
 * 「打回未测」原先也在这个文件里（`ResetSteppedVerdictButton`），现在跟非分步
 * 形态的那一颗一起搬去了抬头 `run-case-heading.tsx`，两种形态的文案在那边仍然
 * 分开写——分步形态回退会连 `step_results` 一起清空，后果不是一回事。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictControls } from "@/components/test-runs/run-verdict-controls";

/**
 * 有步骤的用例：结论那一段只做「读」。
 *
 * 四颗按钮不在这里出现——它们走的是 `setResult`，会把一个结论**覆盖式**铺满
 * 每一步（见 `test-run-verdict-patch.ts` 里那段注释），一点就把用户逐步判出来
 * 的东西连同失败原因一起抹平。要改结论请改分步，那才是唯一的入口。
 *
 * 「打回未测」是把一条判过的用例整个清空重来的唯一办法（回退会把 `step_results`
 * 一并清成空数组），与「改结论」不是一回事，所以它照常给——只是按钮挪去了抬头。
 *
 * 分步判定上线前打的结论没有分步记录（那批行**刻意没有回填**：把「用例通过」
 * 摊成「每一步都通过」等于替当时的测试人员说了他没说过的话）。这种行在这里
 * 明说一句，否则上面那一屏卡片会全是「未判定」，看着像是结论凭空冒出来的。
 */
function SteppedVerdictNote({
	hasStepResults,
	result,
}: {
	hasStepResults: boolean;
	result: TestRunCaseResult;
}) {
	const legacy = !hasStepResults && result !== "untested";
	return (
		<div className="flex flex-col gap-2">
			<p className="text-muted-foreground text-sm">
				本条用例有步骤，结论由上面的分步判定推导，不再单独选择。
			</p>
			{legacy ? (
				<p className="text-muted-foreground text-sm">
					这条结论是分步判定上线前打的，没有分步记录；重新逐步判定并保存后即可补齐。
				</p>
			) : null}
			{/*
			 * 那条老结论的说明文本不在这里重复：抬头的「测试结论：」已经常驻显示
			 * 同一段字，两处并排只会让人分不清是一份还是两份。
			 */}
		</div>
	);
}

/**
 * 结论那一段的主体，两种形态二选一。
 *
 * 有步骤 → 只说明结论是推导来的（判定入口在上面的分步卡片里）；没步骤 → 还是
 * 原来那四颗按钮。两套入口**绝不同时出现**：并存的话用户点一次用例级「通过」
 * 就会把逐步判出来的结果整片盖掉，而界面上不会有任何提示。
 *
 * 抬头那颗「打回未测」不破坏这条不变量：它走的是回退（把整条清成未测），
 * 不是 `setResult`，不会把某一个结论铺满每一步。
 */
export function VerdictBody({
	canConclude,
	hasSteps,
	onCommentSave,
	onPick,
	runCase,
}: {
	canConclude: boolean;
	hasSteps: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}) {
	if (!hasSteps) {
		return (
			<VerdictControls
				comment={runCase.comment}
				disabled={!canConclude}
				onCommentSave={onCommentSave}
				onPick={onPick}
				result={runCase.result}
				runCaseId={runCase.id}
			/>
		);
	}
	return (
		<SteppedVerdictNote
			hasStepResults={runCase.stepResults.length > 0}
			result={runCase.result}
		/>
	);
}
