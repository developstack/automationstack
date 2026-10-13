import { cn } from "@automationstack/ui/lib/utils";

import {
	BARCODE_BOX_CLASSES,
	type BarcodeSize,
} from "@/components/barcode/barcode-box";
import {
	allocateMarks,
	DEFAULT_MAX_MARKS,
} from "@/components/barcode/barcode-marks";

export interface BarcodeSegment {
	/** 竖线的填充色类名，使用状态色令牌，例如 bg-result-passed。 */
	fillClassName: string;
	key: string;
	value: number;
}

interface BarcodeMark {
	fillClassName: string;
	key: string;
}

function buildMarks(
	segments: readonly BarcodeSegment[],
	maxMarks: number
): BarcodeMark[] {
	const { marks: markCounts } = allocateMarks(
		segments.map((segment) => segment.value),
		maxMarks
	);
	const marks: BarcodeMark[] = [];
	for (const [index, segment] of segments.entries()) {
		const markCount = markCounts[index] ?? 0;
		for (let mark = 0; mark < markCount; mark += 1) {
			marks.push({
				fillClassName: segment.fillClassName,
				key: `${segment.key}-${mark}`,
			});
		}
	}
	return marks;
}

interface BarcodeProgressProps {
	className?: string;
	/** 竖线条数的上限。并排的多条进度条用 sharedBarcodeScale 取各行的上限，比例才能比较。 */
	maxMarks?: number;
	segments: readonly BarcodeSegment[];
	size?: BarcodeSize;
}

/**
 * 条形码式进度条：一条竖线表示一个或多个数量，按分段的顺序排列。
 * 竖线对屏幕阅读器隐藏，数量必须由旁边的文字说明。
 */
export function BarcodeProgress({
	className,
	maxMarks = DEFAULT_MAX_MARKS,
	segments,
	size = "md",
}: BarcodeProgressProps) {
	const marks = buildMarks(segments, maxMarks);

	return (
		<div
			aria-hidden="true"
			className={cn("flex min-w-0", BARCODE_BOX_CLASSES[size], className)}
		>
			{marks.length === 0 ? (
				<span
					className="h-full w-full rounded-sm border border-muted-foreground/40 border-dashed"
					data-barcode-empty=""
				/>
			) : (
				marks.map((mark) => (
					<span
						className={cn(
							"min-w-px max-w-1.5 flex-1 rounded-full",
							mark.fillClassName
						)}
						data-barcode-mark=""
						key={mark.key}
					/>
				))
			)}
		</div>
	);
}
