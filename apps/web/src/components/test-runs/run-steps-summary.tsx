/**
 * 分步判定的汇总条：保存后会得到什么结论、还有几步没判、以及三颗动作按钮。
 *
 * ## 四态分布**已经删掉**
 *
 * 这里原先还画一条「2 通过 / 1 失败 / 0 阻塞 / 0 跳过」。用户要求撤掉，原话是
 * 「不要自己加戏」。
 *
 * 撤掉的不只是那一行 JSX：算分布的 `countStepResults` / `emptyStepCounts`
 * （原在 `run-steps-section.tsx`）、`useStepsPreview` 返回值里的 `counts`、
 * 本文件的 `StepResultCounts` 类型与 `counts` prop 全部一并删除，不留只有一个
 * 调用点的死计算。
 *
 * 这条要留个记号：`test-run-step-results-core.ts` 里 `deriveCaseResult` 的注释
 * 曾经**拿这条分布当前提**——「有通过、没失败没阻塞 = 通过，哪怕其余全跳过」
 * 这一档看着比实际乐观，那段注释说「分布必须与结论并排显示」。分布没了，那句话
 * 就不再成立，已经同步改掉。口径本身没变，只是执行台不再替它兜底；真要看
 * 「这条到底测透了没有」，下面每一步的徽章一张卡一张卡都写着。
 *
 * ## 为什么这条不再自带 border-t
 *
 * 用户在真实页面上看到「判定记录」上方叠了**两条**分隔线。成因就是上面那次删除：
 * 分布条撑着的时候这一行有实体内容，一条线上面是步骤、下面是汇总，读得出层次；
 * 分布删掉后，读态（`editing` 为假 → 三颗按钮整组 return null）且步骤全判过
 * （`unjudged` 为 0、`dirty` 为假）时，这一整条**渲染成一个空容器**，只剩
 * `border-t pt-3` 那根光秃秃的横线，紧接着就是 `run-case-events` 自己的
 * `border-t pt-2`。两根线之间什么都没有。
 *
 * 去掉的是**这一条自己的**线，`run-case-events` 那条留着，理由是语义而不是数量：
 * 汇总条（提示 + 三颗按钮）是对上面那些步骤卡片的操作，它和它的操作对象属于
 * 同一个区块，中间划线等于把两者切断；「判定记录」是另一个区块，那条 border-t
 * 才是真正的分节线。
 *
 * 这么改不会让汇总条在任何情况下失去分隔：它只在 `RunStepsSection` 内部渲染，
 * 而那一段只在 `hasSteps` 为真时才存在（`run-case-steps-block.tsx` 里没有步骤
 * 时走的是「该用例没有步骤。」那一句，压根不渲染本组件）。也就是说这条上面
 * **永远**有步骤卡片，间距由 `<section>` 的 `gap-3` 给，不需要线。`pt-3` 一并
 * 去掉——没有 border 的 padding 只是和 gap-3 叠成双份间距。
 *
 * ## 「保存后结论」而不是「当前结论」
 *
 * 这一屏的判定还在本机草稿里（用户选的口径），库里那条用例的结论仍是上一次
 * 保存的值。写成「当前结论」会让人以为已经生效了，于是不点保存就切走。
 *
 * ## 未改动时（`dirty` 为假）不再显示「结论」
 *
 * 执行结论面板已经挪到了这一栏最前面，用例名旁边也常驻结论徽章，`dirty` 为假
 * 时这里画的「结论」就是同一个已保存的值在同一屏上的第三次重复，删掉。
 * `dirty` 为真时的「保存后结论」不受影响——那是**另一个值**：这一屏还没保存的
 * 分步判定推导出来的结果，跟已保存的当前结论不是一回事，别处看不到，必须留。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { StepsSummaryActions } from "@/components/test-runs/steps-summary-actions";
import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

export interface RunStepsSummaryProps {
	/** `fillStepResults` + `deriveCaseResult` 算出来的、保存后会写进库的用例结论。 */
	derived: TestRunCaseResult;
	/** 有没有还没提交的改动。 */
	dirty: boolean;
	/**
	 * false = 判定已保存、这一屏只读，三颗动作按钮整组消失。
	 *
	 * 只读时这里不再给「修改」——那颗按钮搬去了抬头（`run-case-heading.tsx`），
	 * 用户抱怨的正是「还得滚到最后才可以点击」。两处都放会变成同一个动作有两个
	 * 入口，而它们的可用条件必须永远一致，迟早对不上。
	 */
	editing: boolean;
	onPassAll: () => void;
	onReset: () => void;
	onSave: () => void;
	saving: boolean;
	/** 一次都没点过的步骤数。保存时它们会变成「跳过」。 */
	unjudged: number;
}

function StepsSummaryText({
	derived,
	dirty,
	unjudged,
}: Pick<RunStepsSummaryProps, "derived" | "dirty" | "unjudged">) {
	const DerivedIcon = RESULT_ICONS[derived];
	return (
		<div className="flex flex-col gap-1">
			{/*
			 * 只在 dirty 时画「保存后结论」：dirty 为假时这里的结论跟折叠面板
			 * 折叠条、用例名旁边的徽章是同一个已保存的值，画出来就是第三次重复
			 * （见本文件顶部注释）。
			 */}
			{dirty ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">保存后结论</span>
					{/*
					 * 带底色而不是只涂字色：这是整条用例保存后会得到的结论，
					 * 一行同色小字混在旁边的说明里根本挑不出来。
					 */}
					<span
						className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${RESULT_BADGE_CLASSES[derived]}`}
					>
						<DerivedIcon aria-hidden="true" className="size-4" />
						{RESULT_LABELS[derived]}
					</span>
				</div>
			) : null}
			{unjudged > 0 ? (
				<p className="text-muted-foreground text-sm">
					还有 {unjudged} 步没判定，保存时会按「跳过」记录
				</p>
			) : null}
			{dirty ? (
				<p className="text-amber-600 text-sm dark:text-amber-400">
					有未保存的判定，已暂存在本机；刷新或重开页面还在，但只有点保存才进库
				</p>
			) : null}
		</div>
	);
}

export function RunStepsSummary({
	derived,
	dirty,
	editing,
	onPassAll,
	onReset,
	onSave,
	saving,
	unjudged,
}: RunStepsSummaryProps) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<StepsSummaryText derived={derived} dirty={dirty} unjudged={unjudged} />
			<StepsSummaryActions
				dirty={dirty}
				editing={editing}
				onPassAll={onPassAll}
				onReset={onReset}
				onSave={onSave}
				saving={saving}
			/>
		</div>
	);
}
