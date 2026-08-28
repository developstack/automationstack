/**
 * 执行台右栏的各个段落：结论摘要、用例正文、执行结论、缺陷。
 *
 * 从 `run-case-panel.tsx` 拆出来的，理由是 `RunCasePanel` 一个函数就 100 行、
 * 超了 eslint 的 50 行上限；把段落搬走之后那边只剩「这一栏由哪几段按什么顺序
 * 组成」，一眼能读完。抬头后来又从这里搬去了 `run-case-heading.tsx`——
 * 它带上了操作按钮，一个人就顶得上这里两三段。
 *
 * 切口按「段」而不是按行数凑：每个组件正好对应右栏视觉上的一块，各自只拿这一块
 * 需要的数据。段与段之间的间距仍由 `RunCasePanel` 的容器 gap-4 统一提供，
 * 这些组件自己不带外边距。
 *
 * 全部定义在模块顶层。写进 `RunCasePanel` 内部的话，父组件每次重渲染都会造出
 * 新的组件类型，React 认不出是同一个，会把整段卸载重建——「说明」输入框里还没
 * 失焦保存的草稿会当场丢掉。
 *
 * 这里没有一个组件调 hook：`useCaseAttachmentUrls` 留在 `RunCasePanel` 的原位置
 * 一次签完全部贴图，签好的表按 `imageUrls` 传进来。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { RunCaseLastVerdict } from "@/components/test-runs/run-case-events";
import { VerdictBody } from "@/components/test-runs/run-case-verdict-body";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	needsDefectLink,
	VERDICT_SHORTCUT_KEYS,
} from "@/components/test-runs/test-run-meta";

type RunTestCase = RunCaseDetail["testCase"];

/**
 * 抬头下面那句「测试结论：xxxx」。
 *
 * **只读**。可编辑的说明框仍在页面中部的判定控件里（`run-verdict-controls.tsx`），
 * 这里刻意不再放第二个输入框：同一段文字挂两个编辑器，「哪个是准的、没失焦保存
 * 的那份去哪了」立刻变成真问题。这一行要解决的只是「一眼看到上次为什么判成这样」。
 *
 * 空就整行不渲染——一个恒定为空的「测试结论：」比没有更糟，它看着像内容丢了。
 */
export function RunCaseVerdictSummary({ comment }: { comment: string | null }) {
	if (comment === null || comment.trim() === "") {
		return null;
	}
	return (
		// whitespace-pre-wrap：说明里常是分行写的复现步骤，压成一段就读不成路径了
		<p className="whitespace-pre-wrap text-sm">
			<span className="text-muted-foreground">测试结论：</span>
			{comment}
		</p>
	);
}

/**
 * 用例正文。分步判定上线后这里只剩前置条件：步骤连同它们各自的判定搬进了
 * `RunStepsSection`（一步一张卡片）。没有步骤的用例这里也只显示前置条件，
 * 由那一段自己打出「该用例没有步骤」。
 *
 * 这一段带 `border-t`：它上面是抬头与结论摘要（这次执行的事），从这里往下才是
 * 用例本身的内容。分隔线画在这儿，两类信息才不会糊成一片。
 */
export function RunCaseContent({
	imageUrls,
	testCase,
}: {
	imageUrls: MarkdownImageUrls;
	testCase: RunTestCase;
}) {
	return (
		<section className="flex flex-col gap-1 border-t pt-4">
			<h3 className="font-medium text-sm">前置条件</h3>
			{testCase.preconditions ? (
				<MarkdownRender imageUrls={imageUrls} text={testCase.preconditions} />
			) : (
				<p className="text-sm">—</p>
			)}
		</section>
	);
}

function VerdictHeading({ showShortcuts }: { showShortcuts: boolean }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-2">
			<h3 className="font-medium text-sm">执行结论</h3>
			{showShortcuts ? (
				// 快捷键提示常驻显示：每个按钮上有键面，这里再说一遍打完之后的跳转规则
				// （通过/跳过跳下一条，失败/阻塞留原地，plan 012 D1），
				// 否则用户会以为是自己点错了行。
				<p className="text-muted-foreground text-xs">
					快捷键 {VERDICT_SHORTCUT_KEYS.passed} / {VERDICT_SHORTCUT_KEYS.failed}{" "}
					/ {VERDICT_SHORTCUT_KEYS.blocked} / {VERDICT_SHORTCUT_KEYS.skipped}
					，通过/跳过自动跳下一条，失败/阻塞留在本条填写说明
				</p>
			) : null}
		</div>
	);
}

export interface RunCaseVerdictSectionProps {
	canConclude: boolean;
	/** 有步骤的用例走分步判定，这里只显示结论、不给四颗按钮。 */
	hasSteps: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
}

/**
 * 打结论那一段：谁判的 + 四颗结论按钮 + 说明。
 *
 * 「打回未测」不在这里了，它跟着「修改」一起搬去了抬头（`run-case-heading.tsx`）。
 * 留下的是**判定控件本身**——它紧挨着上面的步骤列表是有道理的：人是照着步骤
 * 打结论的，把按钮拽到用例名底下等于要求先滚下去读完步骤再滚回来点。
 */
export function RunCaseVerdictSection({
	canConclude,
	hasSteps,
	item,
	locked,
	onCommentSave,
	onPick,
}: RunCaseVerdictSectionProps) {
	const { executedByName, runCase } = item;

	return (
		<section className="flex flex-col gap-2 border-t pt-4">
			<VerdictHeading showShortcuts={canConclude && !hasSteps} />
			{!(canConclude || locked) && (
				<p className="text-muted-foreground text-sm">
					该测试任务还在待评审阶段，评审完成后才能打结论；现在可以增删用例。
				</p>
			)}
			{/*
			 * 「最后是谁、几点判的」常驻在按钮组正上方：这是用户看一条用例时
			 * 第一个要问的问题，藏进折叠区等于没做。完整的来龙去脉在本面板
			 * 底部的「判定记录」里。
			 */}
			<RunCaseLastVerdict
				executedAt={runCase.executedAt}
				executedByName={executedByName}
				result={runCase.result}
			/>
			<VerdictBody
				canConclude={canConclude}
				hasSteps={hasSteps}
				onCommentSave={onCommentSave}
				onPick={onPick}
				runCase={runCase}
			/>
		</section>
	);
}

export interface RunCaseDefectSectionProps {
	locked: boolean;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
}

/**
 * 缺陷那一段，现在跟着结论摘要一起摆在抬头下面（用户原话：「缺陷也移动到最前面」）。
 *
 * 「相关吗」这条判断连同它的逃生口都收在这里：走 `needsDefectLink`（失败 / 阻塞 /
 * 跳过），**已经填了缺陷的一律照常显示**——否则把一条失败改回通过，那条已经
 * 关联上的缺陷会当场从页面上消失，看着像是被清掉了。
 *
 * 用 `needsDefectLink` 而不是说明与附件那条 `needsVerdictDetails`：只有缺陷多一档
 * 「跳过」，理由写在那两个函数旁边。
 */
export function RunCaseDefectSection({
	locked,
	projectId,
	runCase,
}: RunCaseDefectSectionProps) {
	const hasDefect = runCase.defectKey !== null || runCase.defectUrl !== null;
	if (!(needsDefectLink(runCase.result) || hasDefect)) {
		return null;
	}

	return (
		<RunDefectPanel
			defectKey={runCase.defectKey}
			defectStatus={runCase.defectStatus}
			defectTitle={runCase.defectTitle}
			defectUrl={runCase.defectUrl}
			locked={locked}
			projectId={projectId}
			runCaseId={runCase.id}
		/>
	);
}
