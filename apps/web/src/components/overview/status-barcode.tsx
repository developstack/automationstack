import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { cn } from "@automationstack/ui/lib/utils";

import { barcodeScaleNote } from "@/components/barcode/barcode-marks";
import { BarcodeProgress } from "@/components/barcode/barcode-progress";
import { StatusBadge } from "@/components/status/status-badge";
import { CASE_STATUS_FILL_CLASSES } from "@/components/status/status-badge-meta";

export const STATUS_ORDER: readonly CaseStatus[] = [
	"active",
	"draft",
	"deprecated",
];

interface StatusBarcodeProps {
	counts: Record<CaseStatus, number>;
}

/** 用例状态分布的条形码式进度条和图例。数量在上方的大数字里，所以竖线对屏幕阅读器隐藏。 */
export function StatusBarcode({ counts }: StatusBarcodeProps) {
	const values = STATUS_ORDER.map((status) => counts[status]);

	return (
		<div className="flex flex-col gap-3">
			<BarcodeProgress
				segments={STATUS_ORDER.map((status) => ({
					fillClassName: CASE_STATUS_FILL_CLASSES[status],
					key: status,
					value: counts[status],
				}))}
			/>
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
				<p className="text-muted-foreground">{barcodeScaleNote(values)}</p>
			</div>
		</div>
	);
}
