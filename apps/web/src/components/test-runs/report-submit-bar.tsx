import { Button } from "@automationstack/ui/components/button";
import { LockIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	formatAutoSubmitDate,
	type TestRunReportView,
} from "@/components/test-runs/report-meta";
import { ReportSubmitConfirmDialog } from "@/components/test-runs/report-submit-confirm-dialog";
import { useSubmitTestRun } from "@/components/test-runs/use-test-run-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

const PENDING_BAR_CLASS =
	"flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-700 text-sm dark:text-amber-300";

const LOCKED_BAR_CLASS =
	"flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted px-4 py-3 text-muted-foreground text-sm";

const ICON_CLASS = "size-4 shrink-0";

function SubmittedBar({ report }: { report: TestRunReportView }) {
	const { run, submittedByName } = report;
	if (run.submittedAt === null) {
		return null;
	}
	const actor =
		run.submittedBy === null
			? "由系统自动提交"
			: `由 ${submittedByName ?? "已删除的账号"} 提交`;

	return (
		<div className={LOCKED_BAR_CLASS} role="status">
			<LockIcon aria-hidden="true" className={ICON_CLASS} />
			<span>{`已于 ${formatDateTime(run.submittedAt)} ${actor}，报告已锁定。`}</span>
			<span className="text-xs">
				结论、说明、附件均不可再修改；要继续测试请新建重测任务。
			</span>
		</div>
	);
}

function autoSubmitNotice(report: TestRunReportView): string {
	const days = report.autoSubmitAfterCompletedDays;
	if (report.autoSubmitAt === null) {
		return `本报告尚未提交，数据仍可变动 · 完成满 ${days} 天后将自动提交`;
	}
	return `本报告尚未提交，数据仍可变动 · 将于 ${formatAutoSubmitDate(report.autoSubmitAt)} 自动提交（完成满 ${days} 天）`;
}

function UnsubmittedBar({ report }: { report: TestRunReportView }) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const handleOpenChange = useCloseOnDismiss(close);
	const askConfirm = useCallback(() => setOpen(true), []);
	const submit = useSubmitTestRun();
	const runId = report.run.id;
	const handleConfirm = useCallback(
		() => submit.mutate({ runId }),
		[runId, submit]
	);

	return (
		<div className={PENDING_BAR_CLASS} role="status">
			<TriangleAlertIcon aria-hidden="true" className={ICON_CLASS} />
			<span>{autoSubmitNotice(report)}</span>
			<Button
				className="ml-auto"
				disabled={submit.isPending}
				onClick={askConfirm}
				size="sm"
			>
				提交报告
			</Button>
			<ReportSubmitConfirmDialog
				onConfirm={handleConfirm}
				onOpenChange={handleOpenChange}
				open={open}
				pending={submit.isPending}
				runName={report.run.name}
			/>
		</div>
	);
}

export function ReportSubmitBar({ report }: { report: TestRunReportView }) {
	if (report.run.submittedAt !== null) {
		return <SubmittedBar report={report} />;
	}
	if (report.run.status === "completed") {
		return <UnsubmittedBar report={report} />;
	}
	return null;
}
