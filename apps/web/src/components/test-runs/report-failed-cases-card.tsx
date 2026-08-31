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

/**
 * 没有失败用例时那段话。
 *
 * **绝不能只写「没有失败用例 🎉」**（plan §2.4）。失败数为 0 有两种完全不同的来历：
 * 都测了且都过了，和压根还没测。这一段把还没有结论的条数直接摆出来，
 * 让读的人自己判断，而不是替他下一个「全都通过」的结论。
 */
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

/**
 * 失败用例清单（plan §7.4 的第 4 块，也是这一页真正要交付的东西）。
 *
 * 上面三张图回答「大概什么情况」，只有这张表回答「具体是哪几条、谁测的、为什么挂、
 * 缺陷跟到哪一步了」——它是拿去开会和跟进的那份东西，所以放在最下面、占整行宽度，
 * 而不是塞进图表网格的某一格里。
 */
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
									<TableHead>失败原因</TableHead>
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
