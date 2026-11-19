import {
	EXECUTION_WINDOW_DAYS,
	RECENT_WINDOW_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type {
	MemberWorkload,
	WorkloadCounts,
} from "@automationstack/db/repositories/project-stats-workload-core";

import { sharedBarcodeScale } from "@/components/barcode/barcode-marks";
import { formatCount } from "@/components/overview/overview-metrics";

export type WorkloadPeriod = "last7Days" | "last30Days";

export const PERIOD_OPTIONS: readonly {
	label: string;
	value: WorkloadPeriod;
}[] = [
	{ label: `近 ${RECENT_WINDOW_DAYS} 天`, value: "last7Days" },
	{
		label: `近 ${EXECUTION_WINDOW_DAYS} 天`,
		value: "last30Days",
	},
];

export const DEFAULT_PERIOD: WorkloadPeriod = "last30Days";

export const WORKLOAD_METRICS: readonly {
	key: keyof WorkloadCounts;
	label: string;
}[] = [
	{ key: "executed", label: "执行" },
	{ key: "created", label: "新建用例" },
];

/** 统计口径，放在标题旁边的提示中。 */
export const WORKLOAD_RULES = [
	"执行：成员手动判定过的测试任务用例，同一条只算一次。",
	"自动化回写的结果和已作废的测试任务不计入。",
	"新建用例包括导入的用例。用例删除后仍然计入。",
] as const;

/** 再次点击已按下的时间段时，分段按钮返回空列表。这时保持原来的时间段。 */
export function periodFrom(
	groupValue: string[],
	current: WorkloadPeriod
): WorkloadPeriod {
	return (
		PERIOD_OPTIONS.find((option) => option.value === groupValue[0])?.value ??
		current
	);
}

/** 标题下的合计，例如「近 30 天共执行 209 条、新建 48 条用例」。 */
export function workloadSummary(
	members: readonly MemberWorkload[],
	period: WorkloadPeriod
): string {
	const sum = (key: keyof WorkloadCounts) =>
		members.reduce((total, member) => total + member[period][key], 0);
	const label =
		PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "";
	return `${label}共执行 ${formatCount(sum("executed"))} 条、新建 ${formatCount(sum("created"))} 条用例`;
}

const PERCENT = 100;

/** 一列中条码的竖线上限。竖线最宽 6px，这个数量在常见宽度下放得下。 */
const WORKLOAD_MAX_MARKS = 30;

export interface WorkloadBarScale {
	/** 条码的竖线数。 */
	marksFor: (value: number) => number;
	/** 条码占这一列宽度的百分比。竖线数与宽度成正比，所以各行的竖线一样宽，长短可以比较。 */
	widthPercentFor: (value: number) => number;
}

/** 同一列的各行使用同一个刻度。 */
export function workloadBarScale(values: readonly number[]): WorkloadBarScale {
	const scale = sharedBarcodeScale(values, WORKLOAD_MAX_MARKS);
	const largest = scale.maxMarksFor(Math.max(0, ...values));
	const marksFor = (value: number) =>
		value > 0 ? scale.maxMarksFor(value) : 0;
	return {
		marksFor,
		widthPercentFor: (value) => (marksFor(value) / largest) * PERCENT,
	};
}
