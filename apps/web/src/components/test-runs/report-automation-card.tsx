import { Badge } from "@automationstack/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { formatDateTime } from "@/components/cases/case-meta";
import {
	formatExecutionCounts,
	isExecutionIncomplete,
	type ReportAutomationExecution,
} from "@/components/test-runs/report-automation-meta";
import { ReportCommitLink } from "@/components/test-runs/report-commit-link";

/** 没有分支时的占位。本机跑的脚本本来就没有这一样。 */
const NOT_RECORDED = "—";

/**
 * 执行时间那一格。
 *
 * 显示的是**服务端收到这一轮的时刻**，不是脚本自报的 `finishedAt`：后者来自
 * 客户端时钟，CI 机器的时区/时钟偏差会让同一页上的时间互相打架。
 * `finishedAt` 挂在 title 里，需要对时的人拿得到。
 *
 * 没跑完的那一轮在这里就标出来（§6.3）：它下面那两个条数只是写进去的一部分，
 * 不标出来就会被当成一轮完整的执行去读。
 */
function ExecutionTimeCell({
	execution,
}: {
	execution: ReportAutomationExecution;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span
				title={
					execution.finishedAt === null
						? undefined
						: `脚本自报的结束时间：${formatDateTime(execution.finishedAt)}`
				}
			>
				{formatDateTime(execution.reportedAt)}
			</span>
			{isExecutionIncomplete(execution) ? (
				<Badge
					title="这一轮没跑完（进程被杀或写入回滚），下面的条数只是已经写进去的那部分"
					variant="outline"
				>
					未完成
				</Badge>
			) : null}
		</div>
	);
}

function ExecutionRow({ execution }: { execution: ReportAutomationExecution }) {
	return (
		<TableRow>
			<TableCell>
				<ExecutionTimeCell execution={execution} />
			</TableCell>
			<TableCell>
				{execution.reportedByName ?? (
					<span className="text-muted-foreground">未记录</span>
				)}
			</TableCell>
			<TableCell>
				{execution.branch ?? (
					<span className="text-muted-foreground">{NOT_RECORDED}</span>
				)}
			</TableCell>
			<TableCell>
				<ReportCommitLink
					ciUrl={execution.ciUrl}
					commitSha={execution.commitSha}
				/>
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{execution.updatedCount}
			</TableCell>
			{/*
			 * 跳过条数**必须露出来**（§6.3）：跑了脚本的人默认「这一轮都刷新了」，
			 * 而被跳过的那些行还挂着几天前的人工结论。0 也照显示，不留白——
			 * 空格子会被读成「这一版没统计」。
			 */}
			<TableCell className="text-right tabular-nums">
				{execution.skippedCount}
				{/*
				 * 读屏逐格念出来是两个孤零零的数字，这一句把两个数放回一句话里。
				 * 措辞与 plan §6.3 的示例逐字对齐。
				 */}
				<span className="sr-only">{formatExecutionCounts(execution)}</span>
			</TableCell>
		</TableRow>
	);
}

interface ReportAutomationCardProps {
	className?: string;
	executions: readonly ReportAutomationExecution[];
}

/**
 * 自动化执行记录（plan §6.3）。**位置在失败清单之后**：它是解释性材料，
 * 不是结论，抢在失败清单前面就会把「这轮测得怎么样」的答案往后挤。
 *
 * 存在的唯一理由是 §2.2 那个风险——读报告的人要能看出这批结论是哪一轮脚本
 * 刷进来的、跑在哪个 commit 上、有没有哪几条被跳过。**别给它加别的职责**：
 * 不算率、不做趋势、不判「结果是否过期」（§6.4 三条明确不做）。
 *
 * 一条脚本上报都没有时整块不渲染（返回 null，而不是渲染一张空卡）：
 * 纯手工的测试任务是常态，给每一份手工报告挂一张「暂无自动化执行」的空卡，
 * 等于在报告里常驻一条与这次测试无关的噪声。
 */
export function ReportAutomationCard({
	className,
	executions,
}: ReportAutomationCardProps) {
	if (executions.length === 0) {
		return null;
	}

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>{`自动化执行记录（${executions.length}）`}</CardTitle>
				<CardDescription>
					每一行是一次脚本上报，最近的在最上面。「刷新」与「跳过」都只数本任务的用例——一次执行可能同时写进多个测试任务，跨任务的全局计数在这里会虚高。被跳过的是已有人工结论的行，它们仍然是当初那个人的判断。
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>执行时间</TableHead>
								<TableHead>上报人</TableHead>
								<TableHead>分支</TableHead>
								<TableHead>Commit</TableHead>
								<TableHead className="text-right">刷新</TableHead>
								<TableHead className="text-right">跳过</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{executions.map((execution) => (
								<ExecutionRow
									execution={execution}
									key={execution.executionId}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
