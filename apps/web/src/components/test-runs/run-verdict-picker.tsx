/**
 * 四态结论按钮组 + 「打回未测」。
 *
 * 用一组 `role="radio"` 的按钮而不是原生 `<input type="radio">`：
 * 需要在每个选项里同时排下图标、中文、键面提示三样东西，原生 radio 的
 * `::before` 做不到，而 `packages/ui` 里没有 radio-group（本任务不许新增 ui 组件）。
 * 语义靠 `role="radiogroup"` + `aria-checked` 补齐，键盘可达性由 Button 自带。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { RotateCcwIcon } from "lucide-react";
import { useCallback } from "react";

import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
	VERDICT_SHORTCUT_KEYS,
	VERDICT_VALUES,
} from "@/components/test-runs/test-run-meta";

interface VerdictButtonProps {
	current: TestRunCaseResult;
	disabled: boolean;
	onPick: (result: TestRunCaseResult) => void;
	value: TestRunCaseResult;
}

function VerdictButton({
	current,
	disabled,
	onPick,
	value,
}: VerdictButtonProps) {
	// useCallback 不是为了性能，是 Biome 的 noJsxPropsBind：内联箭头每次渲染
	// 都是新引用。依赖只有真正进闭包的那两个。
	const handleClick = useCallback(() => onPick(value), [onPick, value]);
	const active = current === value;
	const Icon = RESULT_ICONS[value];
	return (
		<Button
			// aria-disabled 而不是 disabled：禁用的按钮仍然要能被 Tab 到，
			// 否则读屏用户根本发现不了「这里有个不能用的控件」。
			aria-checked={active}
			aria-disabled={disabled || undefined}
			className="gap-1.5"
			onClick={disabled ? undefined : handleClick}
			role="radio"
			type="button"
			variant={active ? "default" : "outline"}
		>
			{/* 图标形状本身区分四态，颜色只是加强；选中态用主色底，靠对比而非色相 */}
			<Icon
				aria-hidden="true"
				className={active ? undefined : RESULT_TEXT_CLASSES[value]}
			/>
			{RESULT_LABELS[value]}
			{/* 快捷键必须**看得见**：没有可见提示的快捷键等于不存在 */}
			<kbd className="rounded border px-1 font-mono text-kbd-hint opacity-70">
				{VERDICT_SHORTCUT_KEYS[value]}
			</kbd>
		</Button>
	);
}

export interface VerdictPickerProps {
	disabled: boolean;
	onPick: (result: TestRunCaseResult) => void;
	/** 把结论打回「未测」。已完成的测试任务同样允许（plan §2.2）。 */
	onReset: () => void;
	result: TestRunCaseResult;
}

export function VerdictPicker({
	disabled,
	onPick,
	onReset,
	result,
}: VerdictPickerProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<div
				aria-label="执行结论"
				className="flex flex-wrap gap-2"
				role="radiogroup"
			>
				{VERDICT_VALUES.map((value) => (
					<VerdictButton
						current={result}
						disabled={disabled}
						key={value}
						onPick={onPick}
						value={value}
					/>
				))}
			</div>
			{result !== "untested" && (
				<Button
					aria-disabled={disabled || undefined}
					onClick={disabled ? undefined : onReset}
					type="button"
					variant="ghost"
				>
					<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
					打回未测
				</Button>
			)}
		</div>
	);
}
