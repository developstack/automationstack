import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { StaggerItem } from "@/components/layout/page-stagger";
import { PageTransition } from "@/components/layout/page-transition";
import { ReportAutomationCard } from "@/components/test-runs/report-automation-card";
import { ReportFailedCasesCard } from "@/components/test-runs/report-failed-cases-card";
import type { TestRunReportView } from "@/components/test-runs/report-meta";
import { ReportModuleCard } from "@/components/test-runs/report-module-card";
import { ReportOutOfScopeCard } from "@/components/test-runs/report-out-of-scope-card";
import { ReportPriorityCard } from "@/components/test-runs/report-priority-card";
import { ReportResultCard } from "@/components/test-runs/report-result-card";
import { ReportSubmitBar } from "@/components/test-runs/report-submit-bar";
import { ReportSummaryCard } from "@/components/test-runs/report-summary-card";
import { runPermissions } from "@/components/test-runs/test-run-meta";
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
 * 这一帧到底有没有提交条。
 *
 * 外面必须先问一句、不能无条件套一层 div：REPORT_MAIN 是 grid gap-4，那层 div
 * 即使因为 ReportSubmitBar 返回 null 而高度为 0，它仍然是一个 grid item，仍要
 * 吃掉一道 16px 的 gap。而报告页最常被打开的时刻恰恰是「测试中」——那正是
 * ReportSubmitBar 返回 null 的时刻，也正是 report-skeleton.tsx 刻意不画提交条
 * 所针对的时刻。空 div 留着，骨架那边省下的一条高度又被这 16px 抵掉一截。
 *
 * ⚠️ 判定必须与 ReportSubmitBar 内部**逐字对齐**（report-submit-bar.tsx 末尾）：
 * 已提交（submittedAt 非 null）走灰条，已完成未提交走琥珀条，其余一律 null。
 * 两处对不上就会出现「留了位置却没有条」或者更糟的「有条却被判掉」。
 * 之所以在这里复述而不是从那个文件导出一个谓词，是因为本轮不动 report-submit-bar.tsx；
 * 那边的三态分支若有变动，这里要跟着改。
 */
function hasSubmitBar(report: TestRunReportView): boolean {
	return report.run.submittedAt !== null || report.run.status === "completed";
}

/**
 * 面包屑 + 标题 + 状态徽标那一行。
 *
 * 拆成独立组件不是为了复用（只有一处用），而是为了给 ReportView 腾出
 * eslint `max-lines-per-function`（上限 50 行）的额度：报告主体每接一张卡就多
 * 几行 JSX，而这一段 header 是整块里最长、又与取数和条件渲染最无关的一段，
 * 搬走它不改变任何行为。同文件内拆子组件也是本目录既有的写法
 * （见 report-out-of-scope-card.tsx 里的 OutOfScopeRow / Table / Footer）。
 *
 * FULL_WIDTH 现在写在调用方的 StaggerItem 上而不是这里：包了一层之后
 * grid item 是 StaggerItem 那层，跨列类名留在 <header> 上会落在一个非 grid item
 * 身上，整条跨列当场失效（成因见 page-stagger.tsx 顶部）。
 */
function ReportHeader({
	projectId,
	report,
}: {
	projectId: string;
	report: TestRunReportView;
}) {
	return (
		<header className="flex flex-wrap items-center gap-3">
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
	);
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
 *
 * ## StaggerItem 的 index：提交条不在时**留号不重排**
 *
 * 序号写死成 0..6，提交条那一格（1）在 hasSubmitBar 为假时就空着，后面各项不往前挪。
 * 代价与收益都算得很清楚：
 *
 * - 代价只有一档。封顶是 Math.min(index, 5) × 40ms（见 page-stagger.tsx），
 *   末尾那几项两种算法下都钉在 200ms，**整场进场时长一模一样**；跳号影响到的只是
 *   中段几项各晚 40ms 起步，也就是标题与概览卡之间多一档间隔。
 * - 收益是这份序号成了一张固定的排位表。报告页最常被打开的时刻恰恰是「测试中」
 *   （没有提交条），而已完成时又有；重排的话同一张卡在两种运行状态下排位不同，
 *   而且 report-skeleton.tsx 那份刻意不画提交条的骨架也得跟着重排一次才对得上。
 *   留号之后，骨架的序号就是这里的序号原样去掉 1，两处不需要任何换算。
 * - 重排要么在 JSX 里摊一个数组、要么拿个可变计数器边渲边自增，两者都会把
 *   「顺序即阅读顺序」这件事从源码里藏进一次计算——overview-view.tsx 顶部
 *   拒绝用数组下标当 index，理由与这里同源。
 *
 * ## 自动化与越界那两张卡为什么不包 StaggerItem
 *
 * 它们在没数据时 return null，而 StaggerItem 渲染的是一个真实的 <motion.div>，
 * 和下面那段注释里说的空 <div> 是同一个东西：即使高度为 0 也仍占一个 grid item，
 * 照吃一道 16px 的 gap。空数据恰恰是这两张卡的常态，为了错开而在页尾常驻两道
 * 空白是笔亏本买卖。它们因此只跟着 <main> 整体淡入，不单独错开。
 */
export function ReportView({ projectId, runId }: ReportViewProps) {
	// loader 已把这条查询预热进缓存，这里落地时是命中，不会真的挂起
	// （子树外面没有 Suspense 边界，真挂起会把整个外壳变成空白）。
	const { data: report } = useSuspenseQuery(
		orpc.testRuns.report.queryOptions({ input: { runId } })
	);

	return (
		<PageTransition className={REPORT_MAIN} phase="ready">
			<StaggerItem className={FULL_WIDTH} index={0}>
				<ReportHeader projectId={projectId} report={report} />
			</StaggerItem>

			{hasSubmitBar(report) ? (
				<StaggerItem className={FULL_WIDTH} index={1}>
					<ReportSubmitBar report={report} />
				</StaggerItem>
			) : null}

			<StaggerItem className={FULL_WIDTH} index={2}>
				<ReportSummaryCard report={report} />
			</StaggerItem>

			<StaggerItem className="xl:col-span-2" index={3}>
				<ReportPriorityCard priorities={report.priorities} />
			</StaggerItem>
			<StaggerItem index={4}>
				<ReportResultCard report={report} />
			</StaggerItem>

			<StaggerItem className={FULL_WIDTH} index={5}>
				<ReportModuleCard modules={report.modules} />
			</StaggerItem>

			<StaggerItem className={FULL_WIDTH} index={6}>
				<ReportFailedCasesCard
					counts={report.counts}
					failedCases={report.failedCases}
				/>
			</StaggerItem>

			{/*
			 * 解释性材料排在失败清单之后：先给结论，再给「这批结论是怎么来的」。
			 *
			 * 这两块**都直接坐在 grid 里、外面既不套 div 也不套 StaggerItem**，栅格
			 * 占位靠 className 传进去。两者在没数据时都 return null，而空数据恰恰是
			 * 常态——纯手工的测试任务既没有脚本上报也没有越界用例。套一层的话，即使
			 * 它高度为 0 也仍是一个 grid item，仍要吃掉一道 16px 的 gap，页面末尾就会
			 * 多出一段没人解释得清的空白。它们因此是这一页仅有的两块不错开的内容。
			 */}
			<ReportAutomationCard
				className={FULL_WIDTH}
				executions={report.automationExecutions}
			/>
			<ReportOutOfScopeCard
				cases={report.outOfScopeCases}
				className={FULL_WIDTH}
				locked={runPermissions(report.run.status).locked}
				projectId={projectId}
				runId={runId}
			/>
		</PageTransition>
	);
}
