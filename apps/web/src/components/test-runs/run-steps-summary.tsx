/**
 * 分步判定的汇总条：保存后会得到什么结论、还有几步没判、以及三颗动作按钮。
 *
 * ## 为什么结论与分布必须并排显示
 *
 * 用例结论是分步结果推导出来的（`deriveCaseResult`），而那条规则里有一档是
 * 「有通过、没失败没阻塞 = 通过，哪怕其余全跳过」。只印结论、不印分布，
 * 「1 步通过 + 9 步跳过」会显示成一个干净的「通过」，谁也看不出这条其实没测完。
 * 这不是可选的装饰——`test-run-step-results-core.ts` 里那条注释就是拿这里当
 * 前提写的，删掉分布等于把那个取舍变成一个坑。
 *
 * ## 「保存后结论」而不是「当前结论」
 *
 * 这一屏的判定还在本机草稿里（用户选的口径），库里那条用例的结论仍是上一次
 * 保存的值。写成「当前结论」会让人以为已经生效了，于是不点保存就切走。
 */
import type {
	TestRunCaseResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { CircleCheckBigIcon, RotateCcwIcon, SaveIcon } from "lucide-react";

import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
	STEP_VERDICT_VALUES,
} from "@/components/test-runs/test-run-meta";

export type StepResultCounts = Record<TestRunStepResult, number>;

export interface RunStepsSummaryProps {
	counts: StepResultCounts;
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

function StepDistribution({ counts }: { counts: StepResultCounts }) {
	return (
		<span className="text-muted-foreground text-xs tabular-nums">
			{STEP_VERDICT_VALUES.map(
				(value) => `${counts[value]} ${RESULT_LABELS[value]}`
			).join(" / ")}
		</span>
	);
}

function StepsSummaryText({
	counts,
	derived,
	dirty,
	unjudged,
}: Pick<RunStepsSummaryProps, "counts" | "derived" | "dirty" | "unjudged">) {
	const DerivedIcon = RESULT_ICONS[derived];
	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-muted-foreground">
					{dirty ? "保存后结论" : "结论"}
				</span>
				{/*
				 * 带底色而不是只涂字色：这是整条用例保存后会得到的结论，
				 * 一行同色小字混在「保存后结论 / 分布 / 未判定数」里根本挑不出来。
				 */}
				<span
					className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${RESULT_BADGE_CLASSES[derived]}`}
				>
					<DerivedIcon aria-hidden="true" className="size-4" />
					{RESULT_LABELS[derived]}
				</span>
				<StepDistribution counts={counts} />
			</div>
			{unjudged > 0 ? (
				<p className="text-muted-foreground text-xs">
					还有 {unjudged} 步没判定，保存时会按「跳过」记录
				</p>
			) : null}
			{dirty ? (
				<p className="text-amber-600 text-xs dark:text-amber-400">
					有未保存的判定，已暂存在本机；刷新或重开页面还在，但只有点保存才进库
				</p>
			) : null}
		</div>
	);
}

/**
 * 动作按钮统一 `size="sm"`（28px）。
 *
 * 这是一条**段落**的操作条——它管的是「步骤与判定」这一段，不是整个页面，也不是
 * 卡片内部。按台阶规则（见 `packages/ui/src/components/button.tsx` 文件头）：
 * 卡片里重复出现的判定按钮 xs(24)、这里 sm(28)、页面顶部工具栏 default(32)。
 * 三档拉开，一眼能看出哪一组按钮管的是多大范围。
 */
function StepsSummaryActions({
	dirty,
	editing,
	onPassAll,
	onReset,
	onSave,
	saving,
}: Pick<
	RunStepsSummaryProps,
	"dirty" | "editing" | "onPassAll" | "onReset" | "onSave" | "saving"
>) {
	if (!editing) {
		return null;
	}
	// 「能不能存」算一次给三处用（aria、onClick、文案）：三处各写一遍同一个
	// 布尔表达式，将来加条件时漏掉任何一处，都会变成「看着能点、点了没反应」。
	const saveBlocked = !dirty || saving;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onPassAll} size="sm" type="button" variant="outline">
				<CircleCheckBigIcon aria-hidden="true" data-icon="inline-start" />
				一键全部通过
			</Button>
			{dirty ? (
				<Button onClick={onReset} size="sm" type="button" variant="ghost">
					<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
					放弃改动
				</Button>
			) : null}
			{/*
			 * 没有改动时禁用而不是隐藏：按钮消失会让人以为刚才点的东西没被记下，
			 * 转头去找「保存去哪了」。禁用态摆在原位，配上左边那行「有未保存的
			 * 判定」，两句话合起来才说得清此刻是什么状态。
			 */}
			<Button
				aria-disabled={saveBlocked || undefined}
				onClick={saveBlocked ? undefined : onSave}
				size="sm"
				type="button"
			>
				<SaveIcon aria-hidden="true" data-icon="inline-start" />
				{saving ? "保存中…" : "保存判定"}
			</Button>
		</div>
	);
}

export function RunStepsSummary({
	counts,
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
		<div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
			<StepsSummaryText
				counts={counts}
				derived={derived}
				dirty={dirty}
				unjudged={unjudged}
			/>
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
