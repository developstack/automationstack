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
import { type ChangeEvent, useCallback } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
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
 * 正文两块：操作步骤（深、text-sm）+ 预期（浅、text-xs）。
 *
 * 「预期：」是行内前缀而不是小标题：`shrink-0` 的前缀配 `min-w-0` 的正文，
 * 单行预期与前缀同排，多行预期从第二行起自然缩进对齐，两种都不会撑破卡片。
 *
 * ## 两处刚被用户点名的数值
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
 * ## 预期正文必须显式传 textSize，容器上的 text-xs 管不到它
 *
 * 容器那句 `text-xs` 只喂饱了「预期：」这个纯文本前缀。右边的正文走
 * `MarkdownRender`，而它的根节点把 `text-sm` **写死**在自己身上（理由见那个文件
 * 的头注释：正文里混着 pre / code / 标题，需要一个不随调用点漂移的基准），
 * 继承下来的 xs 会被它原样顶掉——于是同一行里前缀 xs、正文 sm。第一版只改到了
 * 前缀那一半，用户在真实页面上一眼看出来了。
 *
 * 修法是给 MarkdownRender 传 `textSize="xs"` 把**它的基准**挪下来，而不是在外面
 * 加权重去压它。上面的步骤正文不传，保持默认 sm，两者的一号差距因此成立。
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
			<div className="mt-1 flex gap-1 text-muted-foreground text-xs">
				<span className="shrink-0">预期：</span>
				<div className="min-w-0 flex-1">
					<MarkdownRender
						imageUrls={imageUrls}
						text={step.expected}
						textSize="xs"
					/>
				</div>
			</div>
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
