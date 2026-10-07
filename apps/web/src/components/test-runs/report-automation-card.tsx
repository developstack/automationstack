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

const NOT_RECORDED = "—";

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
			<TableCell className="text-right tabular-nums">
				{execution.skippedCount}
				<span className="sr-only">{formatExecutionCounts(execution)}</span>
			</TableCell>
		</TableRow>
	);
}

interface ReportAutomationCardProps {
	className?: string;
	executions: readonly ReportAutomationExecution[];
}

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
