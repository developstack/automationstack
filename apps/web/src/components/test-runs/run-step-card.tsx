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
 * 字体颜色应该要深一点，预期结果的字体颜色相对较浅」），后来又加了一档字号
 * （预期比步骤小一号，同样是用户要求）。但仍然不给预期加小标题、不加分隔线——
 * 同一件事说四遍（浅色 + 小字 + 标题 + 横线）只会让卡片内部看着比卡片之间还碎。
 * 只留一个「预期：」前缀和一段很近的上下间距。
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
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useMemo } from "react";

import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownInline } from "@/components/cases/markdown-inline";
import {
	InlineNodes,
	type MarkdownImageUrls,
} from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";
import { ICON_MOTION } from "@/components/test-runs/run-case-result-badge";
import { StepCardFooter } from "@/components/test-runs/step-card-footer";
import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

/** 抬头右侧那枚结论徽章。带底色而不是只有字色——只读态下它是这张卡的结论。 */
function StepResultBadge({
	result,
}: {
	result: TestRunStepResult | undefined;
}) {
	// Hook 必须在提前 return 之前无条件调用；顺手把变体选出来，
	// 免得再拆一条 `const reduced = ...` 占掉一行（拆分前这份卡片文件一直贴着
	// 300 行上限，这个写法保留）。
	const v = ICON_MOTION[useReducedMotion() ? "reduced" : "full"];
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
			{/* 数值定义与共享理由见 run-case-result-badge.tsx 的 ICON_MOTION。 */}
			<AnimatePresence initial={false} mode="wait">
				<motion.span key={result} {...v}>
					<Icon aria-hidden="true" className="size-3" />
				</motion.span>
			</AnimatePresence>
			{RESULT_LABELS[result]}
		</span>
	);
}

/**
 * 预期正文只有一个段落时交出它的行内节点，否则返回 null（调用点退回块级渲染）。
 * 空正文按「零个行内节点」算——「预期：」照样是完整的一行，不必为它走块级那条路。
 */
function soleParagraphNodes(text: string): MarkdownInline[] | null {
	const blocks = parseMarkdownDoc(text);
	if (blocks.length > 1) {
		return null;
	}
	const [only] = blocks;
	if (only === undefined) {
		return [];
	}
	return only.kind === "paragraph" ? only.children : null;
}

/**
 * 正文两块：操作步骤（深、text-sm）+ 预期（浅、text-xs）。
 *
 * ## 「预期：」必须和预期正文在同一个文本流里
 *
 * 上一版把这里排成两列（`flex` + `shrink-0` 的前缀 + `min-w-0 flex-1` 的正文），
 * 两半的基线对不上：容器上的 `text-xs` 连同它自带的 1rem 行高一起喂给了前缀，
 * 右边 `MarkdownRender` 的根节点却是 `leading-relaxed`（1.625 × 12px = 19.5px），
 * 两个行框各自把文字垂直居中，字形因此差了 (19.5 − 16) / 2 ≈ 1.75px。
 * 用户原话：「预期和内容都没对齐。歪掉了。」
 *
 * 修法不是把两边的行高调成一样——那是拿数值去凑，两侧任何一处字号或 leading
 * 再动一次就再歪一次。这里让前缀作为**行内文本**落进预期段落自己的那个 `<p>`：
 * 同一个行框内部不存在「两半对齐」这件事，也就坏不了。顺带多行预期从第二行起
 * 顶格续排，不再吊在前缀右边缩成一条窄栏（用户原话「为什么不能只写成一行呢」）。
 *
 * ## 两条分支
 *
 * `step.expected` 是完整 markdown，可能不止一个块。单段落（最常见，含软换行的
 * 多行文本）走行内分支；空行分段、列表、代码块这些块级结构塞不进一个 `<p>`，
 * 退回块级渲染、前缀单独成行——那条路上前缀与正文是上下两个块，同样没有横向
 * 对齐可歪。`whitespace-pre-wrap` 由 `TEXT_FLOW_CLASS` 带进来，与块级分支里
 * 段落用的是同一个常量：预期里的换行是用户敲进去的，一个都不能折叠掉。
 *
 * ## 两处被用户点名过的数值
 *
 * `mt-1` 而不是原来的 `mt-3`：步骤与它的预期是**同一件事的两半**，隔开 12px 之后
 * 它们之间的距离已经接近卡片与卡片之间的 `gap-3`，读起来像两个并列的块，
 * 用户的原话是「垂直间隔太远」。收到 4px，预期就明显挂在步骤下面。
 *
 * `text-xs` 而不是继承卡片的 `text-sm`：用户要求预期比步骤正文小一号。这与本文件
 * 开头「层次靠颜色不靠标题和分隔线」并不冲突——那条拦的是**重复编码**（浅色 +
 * 小标题 + 横线三样一起上），这里是把主次从一维（颜色）加到二维（颜色 + 字号），
 * 而且间距刚被收紧、颜色差在小字上本来就更难读，字号正好补上这一半。
 * 注意这一档 `text-xs` 是**卡片内部**的层级，不走面板级的 `RUN_SECTION_TEXT`
 * 口径（见 `run-panel-typography.ts`）；下面的失败原因跟这一档对齐。
 *
 * 行内分支把 xs 直接写在那个 `<p>` 上就够了（前缀和正文同属一个元素，没有第二个
 * 基准可漂）；块级分支仍要给 `MarkdownRender` 传 `textSize="xs"`——它的根节点把
 * 字号写死在自己身上，继承下来的 xs 会被原样顶掉（理由见那个文件的头注释）。
 */
function StepCardBody({
	imageUrls,
	step,
}: {
	imageUrls: MarkdownImageUrls;
	step: CaseStep;
}) {
	// 这次解析只用来选分支。真走块级分支时 MarkdownRender 会按原文自己再 memo 一次，
	// 多出来的那次解析只发生在少见的多块预期上，不值得为它把解析结果一路传下去。
	const inlineNodes = useMemo(
		() => soleParagraphNodes(step.expected),
		[step.expected]
	);
	return (
		<>
			<div className="text-foreground">
				<MarkdownRender imageUrls={imageUrls} text={step.step} />
			</div>
			{inlineNodes === null ? (
				<div className="mt-1 space-y-1 text-muted-foreground text-xs leading-relaxed">
					<p>预期：</p>
					<MarkdownRender
						imageUrls={imageUrls}
						text={step.expected}
						textSize="xs"
					/>
				</div>
			) : (
				<p
					className={`mt-1 text-muted-foreground text-xs leading-relaxed ${TEXT_FLOW_CLASS}`}
				>
					预期：
					<InlineNodes imageUrls={imageUrls} nodes={inlineNodes} />
				</p>
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
