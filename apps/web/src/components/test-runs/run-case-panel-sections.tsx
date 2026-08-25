/**
 * 执行台右栏的各个段落：标题、用例正文、执行结论、缺陷。
 *
 * 从 `run-case-panel.tsx` 拆出来的，理由是 `RunCasePanel` 一个函数就 100 行、
 * 超了 eslint 的 50 行上限；把段落搬走之后那边只剩「这一栏由哪几段按什么顺序
 * 组成」，一眼能读完。
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
import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { RunCaseLastVerdict } from "@/components/test-runs/run-case-events";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictControls } from "@/components/test-runs/run-verdict-controls";
import {
	needsVerdictDetails,
	VERDICT_SHORTCUT_KEYS,
} from "@/components/test-runs/test-run-meta";

type RunTestCase = RunCaseDetail["testCase"];

function StepsTable({
	imageUrls,
	steps,
}: {
	imageUrls: MarkdownImageUrls;
	steps: RunTestCase["steps"];
}) {
	if (steps.length === 0) {
		return <p className="text-muted-foreground text-sm">该用例没有步骤。</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10">#</TableHead>
					<TableHead>操作步骤</TableHead>
					<TableHead>预期结果</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{steps.map((step, index) => (
					<TableRow key={step.id}>
						<TableCell className="text-muted-foreground tabular-nums">
							{index + 1}
						</TableCell>
						{/* whitespace-pre-wrap 交给 MarkdownRender 内部的文本块自己管 */}
						<TableCell>
							<MarkdownRender imageUrls={imageUrls} text={step.step} />
						</TableCell>
						<TableCell>
							<MarkdownRender imageUrls={imageUrls} text={step.expected} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** 用例名与它的几个身份标签。 */
export function RunCaseHeading({ testCase }: { testCase: RunTestCase }) {
	return (
		<div className="flex flex-col gap-2">
			<h2 className="font-medium text-base">{testCase.name}</h2>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline">{testCase.moduleName}</Badge>
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
				<CaseStatusBadge status={testCase.status} />
				<span className="text-muted-foreground text-xs">
					v{testCase.currentVersion}
				</span>
			</div>
		</div>
	);
}

/** 用例正文：前置条件 + 步骤与预期。两段一起搬，它们共用同一份贴图表。 */
export function RunCaseContent({
	imageUrls,
	testCase,
}: {
	imageUrls: MarkdownImageUrls;
	testCase: RunTestCase;
}) {
	return (
		<>
			<section className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">前置条件</h3>
				{testCase.preconditions ? (
					<MarkdownRender imageUrls={imageUrls} text={testCase.preconditions} />
				) : (
					<p className="text-sm">—</p>
				)}
			</section>
			<section className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">步骤与预期</h3>
				<StepsTable imageUrls={imageUrls} steps={testCase.steps} />
			</section>
		</>
	);
}

function VerdictHeading({ canConclude }: { canConclude: boolean }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-2">
			<h3 className="font-medium text-sm">执行结论</h3>
			{canConclude ? (
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
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	onReset: () => void;
}

/** 打结论那一段：谁判的 + 四颗结论按钮 + 说明。 */
export function RunCaseVerdictSection({
	canConclude,
	item,
	locked,
	onCommentSave,
	onPick,
	onReset,
}: RunCaseVerdictSectionProps) {
	const { executedByName, runCase } = item;

	return (
		<section className="flex flex-col gap-2 border-t pt-4">
			<VerdictHeading canConclude={canConclude} />
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
			<VerdictControls
				comment={runCase.comment}
				disabled={!canConclude}
				onCommentSave={onCommentSave}
				onPick={onPick}
				onReset={onReset}
				result={runCase.result}
				runCaseId={runCase.id}
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
 * 缺陷那一段。「相关吗」这条判断连同它的逃生口都收在这里：
 * 结论是失败或阻塞时相关，**已经填了缺陷的一律照常显示**——否则把一条失败
 * 改回通过，那条已经关联上的缺陷会当场从页面上消失，看着像是被清掉了。
 */
export function RunCaseDefectSection({
	locked,
	projectId,
	runCase,
}: RunCaseDefectSectionProps) {
	const hasDefect = runCase.defectKey !== null || runCase.defectUrl !== null;
	if (!(needsVerdictDetails(runCase.result) || hasDefect)) {
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
