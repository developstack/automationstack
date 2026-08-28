/**
 * 修改页面上「怎么给这条用例定结论」那一块，两种形态二选一。
 *
 * 从 `run-case-panel-sections.tsx` 拆出来：那个文件是「一条用例的各段怎么画」的
 * 集合，而这里讲的是同一件事——分步判定上线后，用例级结论变成只读的推导结果。
 * 放在一起，将来要改「结论从哪来」的人一眼能读全。
 *
 * 「打回未测」不在这里：它跟「修改」一起在抬头上（`run-case-heading.tsx`），
 * 两种形态的后果差别写在那颗按钮的确认框里（`run-reset-verdict-button.tsx`）。
 *
 * 说明也不在这里：结果页面同样要显示它，而这一块只在修改页面出现，
 * 所以它是执行结论面板里的另一块（`run-verdict-comment.tsx`）。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictPicker } from "@/components/test-runs/run-verdict-picker";

/**
 * 有步骤的用例：这里只做「说明」，不给按钮。
 *
 * 四颗按钮绝不能在这条路径上出现——它们走的是 `setResult`，会把一个结论
 * **覆盖式**铺满每一步（见 `test-run-verdict-patch.ts` 里那段注释），一点就把
 * 用户逐步判出来的东西连同失败原因一起抹平。要改结论请改分步，那才是唯一的入口。
 *
 * 「打回未测」是把一条判过的用例整个清空重来的唯一办法（回退会把 `step_results`
 * 一并清成空数组），与「改结论」不是一回事，所以它照常给——只是按钮在抬头。
 *
 * 分步判定上线前打的结论没有分步记录（那批行**刻意没有回填**：把「用例通过」
 * 摊成「每一步都通过」等于替当时的测试人员说了他没说过的话）。这种行在这里
 * 明说一句，否则下面那一屏卡片会全是「未判定」，看着像是结论凭空冒出来的。
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
			{/*
			 * 说的是「下面」：执行结论面板现在排在这一栏最前面（用户要的顺序），
			 * 步骤列表在它底下，不再是原先那个「结论在最后、步骤在上面」的版式。
			 */}
			<p className="text-muted-foreground text-sm">
				本条用例有步骤，结论由下面的分步判定推导，不再单独选择。
			</p>
			{legacy ? (
				<p className="text-muted-foreground text-sm">
					这条结论是分步判定上线前打的，没有分步记录；重新逐步判定并保存后即可补齐。
				</p>
			) : null}
		</div>
	);
}

export interface VerdictBodyProps {
	canConclude: boolean;
	/** 有步骤的用例走分步判定，这里只说明结论怎么来，不给四颗按钮。 */
	hasSteps: boolean;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}

/**
 * 两套入口**绝不同时出现**：并存的话用户点一次用例级「通过」就会把逐步判出来的
 * 结果整片盖掉，而界面上不会有任何提示。这条不变量只靠这一个 if/else 兑现，
 * 别在别处再开一个渲染四颗按钮的口子。
 *
 * 抬头那颗「打回未测」不破坏它：那走的是回退（把整条清成未测），不是 `setResult`，
 * 不会把某一个结论铺满每一步。
 */
export function VerdictBody({
	canConclude,
	hasSteps,
	onPick,
	runCase,
}: VerdictBodyProps) {
	if (!hasSteps) {
		return (
			// 改态已经蕴含 canConclude（`useVerdictEditingMode` 的一票否决），这里仍然
			// 把它原样传下去而不是写死 false：那条否决只该有一处，这一层不替它下结论。
			<VerdictPicker
				disabled={!canConclude}
				onPick={onPick}
				result={runCase.result}
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
