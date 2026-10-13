import type { ActiveRunSummary } from "@automationstack/db/repositories/project-stats-runs-core";
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { BarcodeProgress } from "@/components/barcode/barcode-progress";
import { RUN_ROW_GRID } from "@/components/overview/overview-layout";
import {
	formatCount,
	runIdleText,
} from "@/components/overview/overview-metrics";
import { StatusBadge } from "@/components/status/status-badge";
import { RESULT_CHART_COLORS } from "@/components/test-runs/report-meta";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";

/** 进度条的分段顺序：有结论的执行结果在前，未测在最后。 */
const RESULT_ORDER: readonly TestRunCaseResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
	"untested",
];

/** 一行的竖线上限。各行的用例条数不同，准确的条数在右侧的文字中。 */
const RUN_MAX_MARKS = 60;

function countsText(run: ActiveRunSummary): string {
	return RESULT_ORDER.map(
		(result) => `${RESULT_LABELS[result]} ${formatCount(run.counts[result])}`
	).join("，");
}

interface ActiveRunRowProps {
	projectId: string;
	run: ActiveRunSummary;
}

/** M3 的一行：名称、测试任务状态、按执行结果分段的条形码式进度条、有结论的条数和距上次执行的天数。 */
export function ActiveRunRow({ projectId, run }: ActiveRunRowProps) {
	return (
		<li className={RUN_ROW_GRID}>
			<div className="flex min-w-0 items-center gap-2">
				<Link
					className="min-w-0 truncate rounded-sm font-medium text-sm hover:underline"
					params={{ projectId, runId: run.id }}
					to="/projects/$projectId/test-runs/$runId"
				>
					{run.name}
				</Link>
				<StatusBadge kind="runStatus" size="sm" value={run.status} />
			</div>
			<BarcodeProgress
				maxMarks={RUN_MAX_MARKS}
				segments={RESULT_ORDER.map((result) => ({
					fillClassName: RESULT_CHART_COLORS[result].swatch,
					key: result,
					value: run.counts[result],
				}))}
				size="sm"
			/>
			<p className="numeric text-sm">
				{`有结论 ${formatCount(run.concludedCount)} / ${formatCount(run.caseCount)}`}
				<span className="sr-only">{`（${countsText(run)}）`}</span>
			</p>
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				{runIdleText({
					daysSinceLastExecution: run.daysSinceLastExecution,
					executed: run.lastExecutedAt !== null,
				})}
				{run.stalled ? (
					<span className="flex items-center gap-1 font-medium text-foreground">
						<TriangleAlertIcon aria-hidden="true" className="size-3.5" />
						已停滞
					</span>
				) : null}
			</p>
		</li>
	);
}
