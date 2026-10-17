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

import { ReportFailedAndBlockedCaseRow } from "@/components/test-runs/report-failed-and-blocked-case-row";
import type {
	ReportFailedAndBlockedCase,
	TestRunReportView,
} from "@/components/test-runs/report-meta";

const FAILED_AND_BLOCKED_COLUMNS = [
	"用例名",
	"结果",
	"模块",
	"优先级",
	"执行人 / 来源",
	"说明",
	"截图",
	"Jira",
	"Jira 状态",
] as const;

function EmptyFailedAndBlockedCases({
	counts,
}: {
	counts: TestRunReportView["counts"];
}) {
	const { passed, skipped, total, untested } = counts;
	if (total === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				查过了：这个测试任务里一条用例都没有。
			</p>
		);
	}
	return (
		<p className="text-muted-foreground text-sm">
			{`没有失败或阻塞的用例。这不等于全部通过：共 ${total} 条，其中通过 ${passed} 条、未测 ${untested} 条、跳过 ${skipped} 条。`}
		</p>
	);
}

interface ReportFailedAndBlockedCasesCardProps {
	/** 失败和阻塞的用例：先列失败，再列阻塞。 */
	cases: readonly ReportFailedAndBlockedCase[];
	counts: TestRunReportView["counts"];
}

/** 报告中失败和阻塞的用例：每条用例带执行结果，下面是各步骤的实际结果。 */
export function ReportFailedAndBlockedCasesCard({
	cases,
	counts,
}: ReportFailedAndBlockedCasesCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{`失败和阻塞的用例（${cases.length}）`}</CardTitle>
				<CardDescription>
					先列失败，再列阻塞，各自按优先级排序；缺陷状态来自 Jira 同步，未接
					Jira 时为手工填写的链接。
				</CardDescription>
			</CardHeader>
			<CardContent>
				{cases.length === 0 ? (
					<EmptyFailedAndBlockedCases counts={counts} />
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									{FAILED_AND_BLOCKED_COLUMNS.map((column) => (
										<TableHead key={column}>{column}</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{cases.map((row) => (
									<ReportFailedAndBlockedCaseRow
										columnCount={FAILED_AND_BLOCKED_COLUMNS.length}
										key={row.runCaseId}
										row={row}
									/>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
