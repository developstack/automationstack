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

/**
 * 未提交的琥珀色提示条。琥珀是本仓库既有的「软提示」色
 * （见 realtime/editing-notice.tsx、versions/version-diff-steps.tsx）——
 * 主题里没有 warning 令牌，而 destructive 说的是「出错了」，这里没有错。
 *
 * 颜色不单独承担信息：条里有图标、有整句中文、还有一颗按钮，
 * 与下面那条灰色的已锁定条在结构上就不一样（那条没有按钮）。
 */
const PENDING_BAR_CLASS =
	"flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-700 text-sm dark:text-amber-300";

const LOCKED_BAR_CLASS =
	"flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted px-4 py-3 text-muted-foreground text-sm";

const ICON_CLASS = "size-4 shrink-0";

/**
 * 已提交：灰条 + 锁。
 *
 * **`run.submittedBy` 为 null 时必须说「由系统自动提交」**（D16）。那是完成满 N 天
 * 没人管、被惰性结算自动锁上的测试任务，对读报告的人来说，它的可信度与「张三确认过」
 * 完全不是一回事——前者只说明「没人再改它了」，后者才是有人看过并签了字。
 * 把两者显示成同一句话，等于凭空给一份没人看过的报告背书。
 *
 * ⚠️ 判定只认 `run.submittedBy` 这个 uuid，**不看 `submittedByName`**。
 * `submittedAt IS NOT NULL AND submittedBy IS NULL` 是自动提交的唯一标记，
 * 库里没有布尔列；而名字为 null 有两种成因——真·自动提交，和 join 不到人
 * （账号已被删）。拿名字判定会把后者说成前者，等于对着一份有人签过字的报告
 * 说「没人看过」。这条在 packages/db 的 `TestRunReport.submittedByName`
 * 注释里也写着，两边是同一条规则。
 */
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
				结论、说明、附件、缺陷链接均不可再修改；要继续测试请新建重测任务。
			</span>
		</div>
	);
}

/**
 * 自动提交那句预告。
 *
 * 天数与日期都直接用 `testRuns.report` 返回的值：项目没配过时后端已经把兜底默认值
 * 结算好了（`project-settings-repository` 的 `configured: false` + 默认值），
 * 前端再写一个 3 就成了第二处真相，改配置时永远会忘掉它。
 */
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

/**
 * 顶部提交条（plan §7.4 / §2.5）。
 *
 * 三态：
 * - 已提交 → 灰条，说明锁定时间与提交人（自动提交要单独说）。
 * - 已完成未提交 → 琥珀条 + 「提交报告」按钮（二次确认）。
 * - 其余（待评审 / 待测试 / 测试中）→ **不显示**。还没测完就没什么可「确认」的，
 *   摆一颗提交按钮只会引诱人提前锁死一个还在测的测试任务。
 *
 * 这里是这一页唯一的权威性机制。plan §2.3 明确删掉了报告快照、
 * 「数据已变更」披露、追加条数披露、重开次数披露与修改前的确认拦截——
 * 报告本来就是实时查询、任何时刻都自洽，不要再加第二套。
 */
export function ReportSubmitBar({ report }: { report: TestRunReportView }) {
	if (report.run.submittedAt !== null) {
		return <SubmittedBar report={report} />;
	}
	if (report.run.status === "completed") {
		return <UnsubmittedBar report={report} />;
	}
	return null;
}
