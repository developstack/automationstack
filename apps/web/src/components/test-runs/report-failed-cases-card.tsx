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
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import { ReportFailedCaseRow } from "@/components/test-runs/report-failed-case-row";
import type {
	ReportFailedCase,
	TestRunReportView,
} from "@/components/test-runs/report-meta";

function EmptyFailedCases({ counts }: { counts: TestRunReportView["counts"] }) {
	const { blocked, passed, skipped, total, untested } = counts;
	if (total === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				查过了：这个测试任务里一条用例都没有。
			</p>
		);
	}
	return (
		<p className="text-muted-foreground text-sm">
			{`没有失败的用例。这不等于全部通过：共 ${total} 条，其中通过 ${passed} 条、未测 ${untested} 条、阻塞 ${blocked} 条、跳过 ${skipped} 条。`}
		</p>
	);
}

interface ReportFailedCasesCardProps {
	counts: TestRunReportView["counts"];
	failedCases: readonly ReportFailedCase[];
}

export function ReportFailedCasesCard({
	counts,
	failedCases,
}: ReportFailedCasesCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{`失败用例（${failedCases.length}）`}</CardTitle>
				<CardDescription>
					按优先级、模块排序；缺陷状态来自 Jira 同步，未接 Jira
					时为手工填写的链接。
				</CardDescription>
			</CardHeader>
			<CardContent>
				{failedCases.length === 0 ? (
					<EmptyFailedCases counts={counts} />
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>用例名</TableHead>
									<TableHead>模块</TableHead>
									<TableHead>优先级</TableHead>
									<TableHead>执行人 / 来源</TableHead>
									<TableHead>说明</TableHead>
									<TableHead>截图</TableHead>
									<TableHead>Jira</TableHead>
									<TableHead>Jira 状态</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failedCases.map((row) => (
									<ReportFailedCaseRow key={row.runCaseId} row={row} />
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
