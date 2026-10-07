export const DONUT_BOX = "mx-auto aspect-square h-40 w-40";

export const OVERVIEW_BARS_BOX = "aspect-auto h-32 w-full";

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
