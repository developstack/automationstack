/**
 * 一张步骤卡片：序号 + 结论徽章 + 操作步骤 + 预期 + 判定 + 失败原因。
 *
 * ## 为什么从表格改成卡片
 *
 * 原来三列一行（# / 操作步骤 / 预期结果）在只读时够用，加上「每一步都要判定、
 * 失败还要写原因」之后就不行了：判定按钮和多行输入框塞进单元格，会让每一行的
 * 高度取决于最长的那一列，十几步下来整张表参差不齐，而用户的视线要横着走完
 * 三列才能落到按钮上。卡片把一步的全部信息竖着排成一列，判定固定在底部——
 * 每张卡的读法完全一样，扫下来只看最后那一行。
 *
 * 卡片自己是 `bg-card`，右栏底面是灰的（见 `run-execution-layout.tsx`）。
 * 两者同色时「卡片」只剩一圈描边，十几张排下来是一片等距横线，数不清边界在哪。
 *
 * ## 层次靠颜色，不靠标题和分隔线
 *
 * 操作步骤用正常前景色，预期压到 `text-muted-foreground`（用户原话：「步骤显示的
 * 字体颜色应该要深一点，预期结果的字体颜色相对较浅」）。既然颜色已经把主次分开，
 * 就不再给预期加小标题、也不再加分隔线——同一件事说三遍（浅色 + 标题 + 横线）
 * 只会让卡片内部看着比卡片之间还碎。只留一个「预期：」前缀和一段上下间距。
 *
 * ## 两种形态
 *
 * 判定**保存之后这张卡是只读的**：结论变成抬头上的徽章，失败原因变成一块带底色的
 * 只读文本，四颗按钮整组消失。要再改得先在汇总条上点「修改」。理由是保存那一刻
 * 结论已经进了库、也进了流水，此时一次误触就是一条静默的改判；而分步判定的鼠标
 * 移动路径恰恰紧贴着这四颗按钮。
 */

import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { type ChangeEvent, useCallback } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import {
	reasonKindOf,
	StepReasonField,
	StepReasonNote,
} from "@/components/test-runs/run-step-reason";
import {
	RESULT_BADGE_CLASSES,
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

/** 抬头右侧那枚结论徽章。带底色而不是只有字色——只读态下它是这张卡的结论。 */
function StepResultBadge({
	result,
}: {
	result: TestRunStepResult | undefined;
}) {
	if (result === undefined) {
		return (
			<span className="rounded-md bg-muted px-1.5 py-0.5 font-normal text-muted-foreground text-xs">
				未判定
			</span>
		);
	}
	const Icon = RESULT_ICONS[result];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs ${RESULT_BADGE_CLASSES[result]}`}
		>
			<Icon aria-hidden="true" className="size-3" />
			{RESULT_LABELS[result]}
		</span>
	);
}

/**
 * 正文两块：操作步骤（深）+ 预期（浅）。
 *
 * 「预期：」是行内前缀而不是小标题：`shrink-0` 的前缀配 `min-w-0` 的正文，
 * 单行预期与前缀同排，多行预期从第二行起自然缩进对齐，两种都不会撑破卡片。
 */
function StepCardBody({
	imageUrls,
	step,
}: {
	imageUrls: MarkdownImageUrls;
	step: CaseStep;
}) {
	return (
		<>
			<div className="text-foreground">
				<MarkdownRender imageUrls={imageUrls} text={step.step} />
			</div>
			<div className="mt-3 flex gap-1 text-muted-foreground">
				<span className="shrink-0">预期：</span>
				<div className="min-w-0 flex-1">
					<MarkdownRender imageUrls={imageUrls} text={step.expected} />
				</div>
			</div>
		</>
	);
}

/** 判定固定在卡片底部：十几张卡的按钮排在同一个位置，才扫得下来。 */
function StepVerdictRow({
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

/**
 * 卡片下半截：编辑态是「四颗判定 + 原因输入框」，只读态是「一块原因文本」。
 *
 * 两种形态写在一处而不是散在 `RunStepCard` 的 JSX 里，是因为它们互斥且共用
 * 同一个 `reasonKind`——分开写的话，将来给失败/阻塞加一种新形态，很容易
 * 只改到其中一支，另一支静默地还按旧规则渲染。
 */
function StepCardFooter({
	comment,
	editing,
	index,
	onCommentChange,
	onPick,
	result,
	stepId,
}: {
	comment: string;
	editing: boolean;
	index: number;
	onCommentChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	result: TestRunStepResult | undefined;
	stepId: string;
}) {
	const kind = reasonKindOf(result);
	if (!editing) {
		// 只读态：没写过原因就什么都不留，别在卡底吊一块空色块。
		return kind !== null && comment !== "" ? (
			<StepReasonNote kind={kind} value={comment} />
		) : null;
	}
	return (
		<>
			<StepVerdictRow
				current={result}
				index={index}
				onPick={onPick}
				stepId={stepId}
			/>
			{kind === null ? null : (
				<StepReasonField
					kind={kind}
					onChange={onCommentChange}
					stepId={stepId}
					value={comment}
				/>
			)}
		</>
	);
}

export interface RunStepCardProps {
	/** 这一步写过的原因原文。与当前判定无关地一直留着。 */
	comment: string;
	/** false = 判定已保存，这张卡只读；要改得先点汇总条上的「修改」。 */
	editing: boolean;
	imageUrls: MarkdownImageUrls;
	/** 从 0 起的下标，界面上显示 +1。 */
	index: number;
	onCommentChange: (stepId: string, text: string) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	/** `undefined` = 还没点过。保存时会被服务端补成「跳过」。 */
	result: TestRunStepResult | undefined;
	step: CaseStep;
}

export function RunStepCard({
	comment,
	editing,
	imageUrls,
	index,
	onCommentChange,
	onPick,
	result,
	step,
}: RunStepCardProps) {
	const handleCommentChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onCommentChange(step.id, event.target.value),
		[onCommentChange, step.id]
	);

	return (
		<Card size="sm">
			<CardHeader>
				{/* 序号靠左、徽章靠右：十张卡的徽章因此落在同一条竖线上，能整列扫 */}
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground tabular-nums">
						步骤 {index + 1}
					</span>
					<StepResultBadge result={result} />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<StepCardBody imageUrls={imageUrls} step={step} />
				<StepCardFooter
					comment={comment}
					editing={editing}
					index={index}
					onCommentChange={handleCommentChange}
					onPick={onPick}
					result={result}
					stepId={step.id}
				/>
			</CardContent>
		</Card>
	);
}
