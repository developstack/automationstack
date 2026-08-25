/**
 * 执行台右栏：用例内容（实时）+ 结论 + 说明 + 附件 + 缺陷。
 *
 * 用例内容来自后端的 `innerJoin test_cases`，是**当前**内容而不是创建测试任务时的快照
 * （D2：用例永远只有一份）。所以这里不做任何本地缓存或版本对比——别人改了用例，
 * 第一期已有的 `case` 失效事件会把这一页刷新到最新。
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

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { RunAttachments } from "@/components/test-runs/run-attachments";
import {
	RunCaseEvents,
	RunCaseLastVerdict,
} from "@/components/test-runs/run-case-events";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictControls } from "@/components/test-runs/run-verdict-controls";
import {
	needsVerdictDetails,
	VERDICT_SHORTCUT_KEYS,
} from "@/components/test-runs/test-run-meta";

function StepsTable({
	imageUrls,
	steps,
}: {
	imageUrls: MarkdownImageUrls;
	steps: RunCaseDetail["testCase"]["steps"];
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

export interface RunCasePanelProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	/** 把结论打回「未测」。已完成的测试任务同样允许（plan §2.2）。 */
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	storageUnavailable: boolean;
}

export function RunCasePanel({
	canConclude,
	item,
	locked,
	onCommentSave,
	onPick,
	onReset,
	onStorageUnavailable,
	projectId,
	storageUnavailable,
}: RunCasePanelProps) {
	const { executedByName, runCase, testCase } = item;
	// 一次请求签完这条用例的全部贴图，正文里的引用按 id 查表；执行台是只读侧，
	// 不套 CaseAttachmentProvider（那边才有粘贴上传）。
	const imageUrls = useCaseAttachmentUrls(testCase.id);
	/**
	 * 说明 / 附件 / 缺陷三块共用**同一条**规则：结论是失败或阻塞才相关。
	 * 通过一条用例本该是「点一下就走」，之前三块无条件常驻，等于每判一条
	 * 都要略过三个空控件。
	 *
	 * 每块另外各带一条逃生口——**已经有内容的一律照常显示**。说明的那条在
	 * `VerdictControls` 里（它还要照顾没失焦保存的草稿），附件的那条在
	 * `RunAttachments` 里（只有它知道有几条附件），这里只判缺陷。
	 */
	const detailsRelevant = needsVerdictDetails(runCase.result);
	const hasDefect = runCase.defectKey !== null || runCase.defectUrl !== null;

	return (
		<div className="flex flex-col gap-4 p-4">
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
			<section className="flex flex-col gap-2 border-t pt-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h3 className="font-medium text-sm">执行结论</h3>
					{canConclude ? (
						// 快捷键提示常驻显示：每个按钮上有键面，这里再说一遍打完之后的跳转规则
						// （通过/跳过跳下一条，失败/阻塞留原地，plan 012 D1），
						// 否则用户会以为是自己点错了行。
						<p className="text-muted-foreground text-xs">
							快捷键 {VERDICT_SHORTCUT_KEYS.passed} /{" "}
							{VERDICT_SHORTCUT_KEYS.failed} / {VERDICT_SHORTCUT_KEYS.blocked} /{" "}
							{VERDICT_SHORTCUT_KEYS.skipped}
							，通过/跳过自动跳下一条，失败/阻塞留在本条填写说明
						</p>
					) : null}
				</div>
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
			<RunAttachments
				locked={locked}
				onStorageUnavailable={onStorageUnavailable}
				relevant={detailsRelevant}
				runCaseId={runCase.id}
				storageUnavailable={storageUnavailable}
			/>
			{detailsRelevant || hasDefect ? (
				<RunDefectPanel
					defectKey={runCase.defectKey}
					defectStatus={runCase.defectStatus}
					defectTitle={runCase.defectTitle}
					defectUrl={runCase.defectUrl}
					locked={locked}
					projectId={projectId}
					runCaseId={runCase.id}
				/>
			) : null}
			{/*
			 * 用例级的时间线放在本面板最底部（不是页面底部——页面底部那份是
			 * 任务级的「变更历史」）。切用例时整个面板带 key 重建，
			 * 加上 query key 里带 runCaseId，不会短暂显示上一条的历史。
			 */}
			<RunCaseEvents runCaseId={runCase.id} />
		</div>
	);
}
