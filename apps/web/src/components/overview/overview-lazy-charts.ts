import { lazy } from "react";

// Recharts 较大，图表按需加载。每个卡片用 ChartSuspense 包住这些组件。

export const LazyCaseTrendChart = lazy(async () => {
	const chartModule = await import("@/components/overview/case-trend-chart");
	return { default: chartModule.CaseTrendChart };
});

export const LazyCoverageRateChart = lazy(async () => {
	const chartModule = await import("@/components/overview/coverage-rate-chart");
	return { default: chartModule.CoverageRateChart };
});

export const LazyUnexecutedModulesChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/unexecuted-modules-chart"
	);
	return { default: chartModule.UnexecutedModulesChart };
});

export const LazyExecutionTrendChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/execution-trend-chart"
	);
	return { default: chartModule.ExecutionTrendChart };
});

export const LazyRunTrendChart = lazy(async () => {
	const chartModule = await import("@/components/overview/run-trend-chart");
	return { default: chartModule.RunTrendChart };
});
