export const DONUT_BOX = "mx-auto aspect-square h-40 w-40";

export const REPORT_BARS_BOX = "aspect-auto w-full";

const REPORT_PRIORITY_ROW_PX = 32;

export function reportPriorityHeightPx(rowCount: number): number {
	return rowCount * REPORT_PRIORITY_ROW_PX;
}

const MODULE_PLOT_HEIGHT_PX = 40;
const X_AXIS_LABEL_BAND_PX = 24;
const MIN_CHART_HEIGHT_PX = 160;
const MAX_CHART_HEIGHT_PX = 320;

export function reportModuleHeightPx(moduleCount: number): number {
	const fitted = moduleCount * MODULE_PLOT_HEIGHT_PX + X_AXIS_LABEL_BAND_PX;
	return Math.min(MAX_CHART_HEIGHT_PX, Math.max(MIN_CHART_HEIGHT_PX, fitted));
}

const UNEXECUTED_ROW_HEIGHT_PX = 28;
const UNEXECUTED_AXIS_BAND_PX = 8;

/** M4 模块条形图的高度：每个模块一行。图表和加载时的空盒子都使用这个高度。 */
export function unexecutedChartHeightPx(moduleCount: number): number {
	return moduleCount * UNEXECUTED_ROW_HEIGHT_PX + UNEXECUTED_AXIS_BAND_PX;
}
