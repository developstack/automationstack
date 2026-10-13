import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { cn } from "@automationstack/ui/lib/utils";

import { BARCODE_BOX } from "@/components/overview/overview-layout";
import { allocateMarks } from "@/components/overview/overview-metrics";
import { StatusBadge } from "@/components/status/status-badge";
import { CASE_STATUS_FILL_CLASSES } from "@/components/status/status-badge-meta";

export const STATUS_ORDER: readonly CaseStatus[] = [
	"active",
	"draft",
	"deprecated",
];

const MAX_MARKS = 120;

interface Mark {
	key: string;
	status: CaseStatus;
}

function buildMarks(counts: Record<CaseStatus, number>) {
	const allocation = allocateMarks(
		STATUS_ORDER.map((status) => counts[status]),
		MAX_MARKS
	);
	const marks: Mark[] = [];
	for (const [index, status] of STATUS_ORDER.entries()) {
		const markCount = allocation.marks[index] ?? 0;
		for (let mark = 0; mark < markCount; mark += 1) {
			marks.push({ key: `${status}-${mark}`, status });
		}
	}
	return { casesPerMark: allocation.casesPerMark, marks };
}

function scaleNote(casesPerMark: number, exact: boolean): string {
	return exact
		? `每条竖线表示 ${casesPerMark} 条用例`
		: `每条竖线约表示 ${casesPerMark} 条用例`;
}

interface StatusBarcodeProps {
	counts: Record<CaseStatus, number>;
	total: number;
}

/** 用例状态分布的条形码式进度条和图例。数量在上方的大数字里，所以竖线对屏幕阅读器隐藏。 */
export function StatusBarcode({ counts, total }: StatusBarcodeProps) {
	const { casesPerMark, marks } = buildMarks(counts);
	const exact = casesPerMark * marks.length === total;

	return (
		<div className="flex flex-col gap-3">
			<div aria-hidden="true" className={BARCODE_BOX}>
				{marks.map((mark) => (
					<span
						className={cn(
							"min-w-px max-w-1.5 flex-1 rounded-full",
							CASE_STATUS_FILL_CLASSES[mark.status]
						)}
						key={mark.key}
					/>
				))}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
				<ul className="flex flex-wrap gap-x-4 gap-y-1">
					{STATUS_ORDER.map((status) => (
						<li className="flex items-center gap-1.5" key={status}>
							<span
								aria-hidden="true"
								className={cn(
									"h-3 w-1 rounded-full",
									CASE_STATUS_FILL_CLASSES[status]
								)}
							/>
							<StatusBadge kind="caseStatus" value={status} />
						</li>
					))}
				</ul>
				<p className="text-muted-foreground">
					{scaleNote(casesPerMark, exact)}
				</p>
			</div>
		</div>
	);
}
