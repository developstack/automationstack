/**
 * 一张步骤卡片底部那一行判定：四颗按钮排成一个 radiogroup。
 *
 * 从 `run-step-card.tsx` 拆出来（那个文件的私有辅助组件超过了一个文件 2 个的
 * 上限）。四颗按钮本身跟着一起搬：`StepVerdictButton` 只服务这一行。
 */

import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
	STEP_VERDICT_VALUES,
} from "@/components/test-runs/test-run-meta";

interface StepVerdictButtonProps {
	current: TestRunStepResult | undefined;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	stepId: string;
	value: TestRunStepResult;
}

function StepVerdictButton({
	current,
	onPick,
	stepId,
	value,
}: StepVerdictButtonProps) {
	// useCallback 不是为了性能，是 Biome 的 noJsxPropsBind：内联箭头每次渲染都是新引用。
	const handleClick = useCallback(
		() => onPick(stepId, value),
		[onPick, stepId, value]
	);
	const active = current === value;
	const Icon = RESULT_ICONS[value];
	return (
		<Button
			aria-checked={active}
			onClick={handleClick}
			role="radio"
			// xs（24px）：这四颗在每张卡里各出现一次，一屏十张卡就是四十颗。
			// 尺寸台阶的分配规则见 `packages/ui/src/components/button.tsx` 的文件头。
			size="xs"
			type="button"
			variant={active ? "default" : "outline"}
		>
			{/* 图标形状本身区分四态，颜色只是加强；选中态用主色底，靠对比而非色相 */}
			<Icon
				aria-hidden="true"
				className={active ? undefined : RESULT_TEXT_CLASSES[value]}
			/>
			{RESULT_LABELS[value]}
		</Button>
	);
}

/** 判定固定在卡片底部：十几张卡的按钮排在同一个位置，才扫得下来。 */
export function StepVerdictRow({
	current,
	index,
	onPick,
	stepId,
}: {
	current: TestRunStepResult | undefined;
	index: number;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	stepId: string;
}) {
	return (
		<div
			aria-label={`步骤 ${index + 1} 的判定`}
			className="mt-3 flex flex-wrap gap-1.5 border-t pt-3"
			role="radiogroup"
		>
			{STEP_VERDICT_VALUES.map((value) => (
				<StepVerdictButton
					current={current}
					key={value}
					onPick={onPick}
					stepId={stepId}
					value={value}
				/>
			))}
		</div>
	);
}
