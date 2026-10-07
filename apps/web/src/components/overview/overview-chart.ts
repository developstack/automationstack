import { useReducedMotion } from "motion/react";

export const CHART_SEAM = { stroke: "var(--card)", strokeWidth: 2 } as const;

export const CHART_ANIMATION = {
	animationDuration: 400,
	animationEasing: "ease-out",
} as const;

export function useChartAnimation(): boolean {
	return useReducedMotion() !== true;
}
