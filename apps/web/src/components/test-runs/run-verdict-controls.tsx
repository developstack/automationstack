/**
 * 结论选择（通过 / 失败 / 阻塞 / 跳过）+ 说明。
 *
 * 用一组 `role="radio"` 的按钮而不是原生 `<input type="radio">`：
 * 需要在每个选项里同时排下图标、中文、键面提示三样东西，原生 radio 的
 * `::before` 做不到，而 `packages/ui` 里没有 radio-group（本任务不许新增 ui 组件）。
 * 语义靠 `role="radiogroup"` + `aria-checked` 补齐，键盘可达性由 Button 自带。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { Textarea } from "@automationstack/ui/components/textarea";
import { RotateCcwIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import {
	commentFieldText,
	needsVerdictDetails,
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

export interface VerdictControlsProps {
	comment: string | null;
	disabled: boolean;
	/** 说明失焦时保存；不改结论。 */
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	/** 把结论打回「未测」。已完成的测试任务同样允许（plan §2.2）。 */
	onReset: () => void;
	result: TestRunCaseResult;
	/** 每条用例一个 key，用来在切换用例时重置说明输入框。 */
	runCaseId: string;
}

/**
 * 说明是**受控 + 本地草稿**：输入时不打请求（每敲一个字发一次会把
 * 变更历史刷成噪音），失焦或切用例时才保存。切用例时用 runCaseId 做 effect
 * 依赖把草稿重置回服务端值，否则上一条的说明会跟着跑到下一条上。
 */
export function VerdictControls({
	comment,
	disabled,
	onCommentSave,
	onPick,
	onReset,
	result,
	runCaseId,
}: VerdictControlsProps) {
	const [draft, setDraft] = useState(comment ?? "");

	useEffect(() => {
		setDraft(comment ?? "");
		// comment 也进依赖：别人改了同一条的说明时，实时失效会把新值推过来。
	}, [comment]);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
		[]
	);

	const handleBlur = useCallback(() => {
		const next = draft.trim() === "" ? null : draft;
		if (next !== (comment ?? null)) {
			onCommentSave(next);
		}
	}, [comment, draft, onCommentSave]);

	/**
	 * 说明框只在**失败 / 阻塞**下出现（`needsVerdictDetails`），外加两条逃生口：
	 *
	 * - `comment` 非空：判过失败又改判通过时那段文字还在库里（后端只有回退成
	 *   `untested` 才清），藏起来等于让人以为丢了；
	 * - `draft` 非空：**还没失焦保存**的输入。点结论按钮时浏览器先把 textarea
	 *   blur 掉再派发 click（base-ui 的 Button 没有在 mousedown/pointerdown 上
	 *   preventDefault，焦点确实会移走），所以 `handleBlur` 一定先跑完；这一条
	 *   是不依赖那个顺序的兜底——输入框绝不会带着没存的字被规则卸载掉。
	 */
	const commentText = commentFieldText(result);
	const showComment =
		needsVerdictDetails(result) || (comment ?? "") !== "" || draft !== "";

	return (
		<div className="flex flex-col gap-3">
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
			{showComment ? (
				<div className="flex flex-col gap-1.5">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="run-comment"
					>
						{commentText.label}
					</label>
					<Textarea
						id="run-comment"
						key={runCaseId}
						onBlur={handleBlur}
						onChange={handleChange}
						placeholder={commentText.placeholder}
						// readOnly 而不是 disabled：已提交的测试任务里这段说明仍然要能被选中复制，
						// 而 disabled 的 textarea 连读屏都会跳过。
						readOnly={disabled}
						rows={3}
						value={draft}
					/>
				</div>
			) : null}
		</div>
	);
}
