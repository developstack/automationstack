import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { PageTransition } from "@/components/layout/page-transition";
import { ReportFailedCasesCard } from "@/components/test-runs/report-failed-cases-card";
import { ReportModuleCard } from "@/components/test-runs/report-module-card";
import { ReportPriorityCard } from "@/components/test-runs/report-priority-card";
import { ReportResultCard } from "@/components/test-runs/report-result-card";
import { ReportSubmitBar } from "@/components/test-runs/report-submit-bar";
import { ReportSummaryCard } from "@/components/test-runs/report-summary-card";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import { orpc } from "@/utils/orpc";

/**
 * 报告页 <main> 的类名。
 *
 * 与概览页同一套：p-4 的 gutter 与 header 的 px-4 对齐，路由层不要再套 px-*。
 * 导出是为了让路由的 pendingComponent 落在同一份类名上（理由见 overview-view.tsx）。
 *
 * 三列栅格 + auto-rows-min：不给 auto-rows-min，同一行的卡会被拉成等高，
 * 结果分布那张短卡会跟着旁边的长表一起抻长。
 */
export const REPORT_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-3";

/** 跨整行的卡：提交条、概览、模块、失败清单都不该被挤进三分之一列。 */
const FULL_WIDTH = "xl:col-span-3";

interface ReportViewProps {
	projectId: string;
	runId: string;
}

/**
 * 测试任务报告页（plan §7.4）。
 *
 * **从「测试中」就能打开**，不是等到已完成才给看。完成之后完成率必然是 100%，
 * 那时这一页只剩一个数；真正需要看图的时刻恰恰在测试过程中——还剩多少没测、
 * 哪个模块在垮、P0 有没有挂。
 *
 * 页面**没有快照**（plan §2.3）：每次打开都是对当前数据的实时查询，因此也就不需要
 * 「数据已变更」的披露条、追加条数提示、重开次数提示或修改前的确认拦截——
 * 那些机制存在的前提是「你看到的可能是旧的」，而这里不存在旧的。这一页唯一的
 * 权威性机制是顶部提交条那把锁（§2.5）。
 *
 * 顺序 = 阅读顺序：能不能上线（提交条 / 概览 / 按优先级）→ 哪里在垮（分布 / 模块）
 * → 具体是哪几条（失败清单）。按优先级那张图排在图表区第一位并占两列宽，
 * 因为 P0 有没有失败是上线红线，它比别的图更该先被看到。
 */
export function ReportView({ projectId, runId }: ReportViewProps) {
	// loader 已把这条查询预热进缓存，这里落地时是命中，不会真的挂起
	// （子树外面没有 Suspense 边界，真挂起会把整个外壳变成空白）。
	const { data: report } = useSuspenseQuery(
		orpc.testRuns.report.queryOptions({ input: { runId } })
	);

	return (
		<PageTransition className={REPORT_MAIN} phase="ready">
			<header className={`${FULL_WIDTH} flex flex-wrap items-center gap-3`}>
				<Link
					className="inline-flex items-center gap-1 text-muted-foreground text-sm underline-offset-4 hover:underline"
					params={{ projectId }}
					to="/projects/$projectId/test-runs"
				>
					<ChevronLeftIcon aria-hidden="true" className="size-4" />
					测试任务列表
				</Link>
				<h1 className="font-semibold text-lg">{report.run.name}</h1>
				<TestRunStatusBadge status={report.run.status} />
			</header>

			<div className={FULL_WIDTH}>
				<ReportSubmitBar report={report} />
			</div>

			<div className={FULL_WIDTH}>
				<ReportSummaryCard report={report} />
			</div>

			<ReportPriorityCard
				className="xl:col-span-2"
				priorities={report.priorities}
			/>
			<ReportResultCard report={report} />

			<ReportModuleCard className={FULL_WIDTH} modules={report.modules} />

			<div className={FULL_WIDTH}>
				<ReportFailedCasesCard
					counts={report.counts}
					failedCases={report.failedCases}
				/>
			</div>
		</PageTransition>
	);
}
