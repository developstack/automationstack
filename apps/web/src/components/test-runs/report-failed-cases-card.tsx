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
import { ExternalLinkIcon } from "lucide-react";

import {
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { AttachmentCell } from "@/components/test-runs/report-attachment-cell";
import {
	isSafeHttpUrl,
	type ReportFailedCase,
	type TestRunReportView,
} from "@/components/test-runs/report-meta";

/**
 * 缺陷状态为空时的占位。
 *
 * 与 `RATE_UNKNOWN` 是同一个字符但不是同一件事，所以另立一个常量：那边说的是
 * 「分母为 0，率算不出来」，这里说的是「这条缺陷没有状态（多半是没接 Jira）」。
 * 共用一个常量会让将来改其中一处时顺手改错另一处。
 */
const NO_DEFECT_STATUS = "—";

/**
 * 缺陷列。
 *
 * Jira 未配置时 `defectUrl` 是用户手打的纯文本（D9 的降级），也就是完全可控的字符串；
 * 不是 http(s) 就**降级成纯文本显示而不是丢掉**——那毕竟是有人填进去的内容，
 * 读报告的人有权看到它写的是什么（哪怕是「见群里的截图」）。判定见 isSafeHttpUrl。
 */
function DefectCell({ row }: { row: ReportFailedCase }) {
	const label = row.defectKey ?? row.defectUrl;
	if (label === null) {
		return <span className="text-muted-foreground">未关联</span>;
	}
	if (!isSafeHttpUrl(row.defectUrl)) {
		return <span title={row.defectTitle ?? undefined}>{label}</span>;
	}
	return (
		<a
			className="inline-flex items-center gap-1 underline underline-offset-2"
			href={row.defectUrl ?? ""}
			rel="noopener"
			target="_blank"
			title={row.defectTitle ?? undefined}
		>
			{label}
			<ExternalLinkIcon aria-hidden="true" className="size-3.5" />
		</a>
	);
}

function FailedCaseRow({ row }: { row: ReportFailedCase }) {
	return (
		<TableRow>
			<TableCell className="font-medium">{row.name}</TableCell>
			<TableCell>{row.moduleName}</TableCell>
			<TableCell>
				<Badge variant={PRIORITY_BADGE_VARIANTS[row.priority]}>
					{row.priority}
				</Badge>
			</TableCell>
			<TableCell>
				{row.executedByName ?? (
					<span className="text-muted-foreground">未记录</span>
				)}
				{row.executedAt === null ? null : (
					<span className="block text-muted-foreground text-xs">
						{formatDateTime(row.executedAt)}
					</span>
				)}
			</TableCell>
			{/*
			 * 失败原因是执行时手写的多行文本，whitespace-pre-wrap 保住换行；
			 * 没写就明说「未填写」——空单元格会被当成「加载没出来」。
			 */}
			<TableCell className="max-w-xs whitespace-pre-wrap">
				{row.comment ?? (
					<span className="text-muted-foreground">未填写失败原因</span>
				)}
			</TableCell>
			<TableCell>
				<AttachmentCell
					attachmentCount={row.attachmentCount}
					caseName={row.name}
					runCaseId={row.runCaseId}
				/>
			</TableCell>
			<TableCell>
				<DefectCell row={row} />
			</TableCell>
			<TableCell>
				{row.defectStatus ?? (
					<span className="text-muted-foreground">{NO_DEFECT_STATUS}</span>
				)}
			</TableCell>
		</TableRow>
	);
}

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
									<TableHead>执行人</TableHead>
									<TableHead>失败原因</TableHead>
									<TableHead>截图</TableHead>
									<TableHead>Jira</TableHead>
									<TableHead>Jira 状态</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failedCases.map((row) => (
									<FailedCaseRow key={row.runCaseId} row={row} />
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
