import { Badge } from "@automationstack/ui/components/badge";
import { TableCell, TableRow } from "@automationstack/ui/components/table";
import { ExternalLinkIcon } from "lucide-react";

import {
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { AttachmentCell } from "@/components/test-runs/report-attachment-cell";
import { ReportCommitLink } from "@/components/test-runs/report-commit-link";
import {
	isSafeHttpUrl,
	type ReportFailedCase,
} from "@/components/test-runs/report-meta";

/**
 * 失败用例清单里的一行（从 report-failed-cases-card.tsx 拆出来）。
 *
 * 两个只服务于这一行的单元格（缺陷列、来源列）跟着一起搬过来，它们在别处
 * 没有用途，也没有对外契约。
 */

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

/**
 * 「怎么复现」那一小行（plan §6.2）。
 *
 * 读报告的人看到一条 failed，第一个问题永远是「能重现吗」。李四手工测出来的失败，
 * 「李四 + 周三 15:20 + 说明」就够了；张三脚本报的失败，光有这些无从下手——
 * 三天后要复现，得知道**哪个分支、哪个 commit**，还要能点回 CI。
 *
 * 只在 `executedVia === "automation"` 时出现。**不给 null 编故事**：那一列的 null
 * 是「不知道」（未测的行，以及第二期写下的历史结论），不等于「手工」。
 *
 * `executedVia` 是脚本、`automationExecution` 却是 null，是一种真实且正常的状态：
 * 执行记录被运维清理时外键是 `set null`（见 schema 注释），结论仍然是脚本打的，
 * 只是那条 CI 链接没了。这时仍要出脚本标记，把「没有记录可点」说出来，
 * 而不是让这条失败看起来像人测的。
 */
function SourceCell({ row }: { row: ReportFailedCase }) {
	if (row.executedVia !== "automation") {
		return null;
	}
	const execution = row.automationExecution;
	return (
		<span className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
			<Badge variant="secondary">脚本</Badge>
			{execution === null ? (
				<span className="text-muted-foreground">执行记录已清理</span>
			) : (
				<>
					<span className="text-muted-foreground">
						{execution.branch ?? "未记录分支"}
					</span>
					<ReportCommitLink
						ciUrl={execution.ciUrl}
						commitSha={execution.commitSha}
					/>
				</>
			)}
		</span>
	);
}

export function ReportFailedCaseRow({ row }: { row: ReportFailedCase }) {
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
				<SourceCell row={row} />
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
