import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
	StatusBadge,
	type StatusBadgeProps,
} from "@/components/status/status-badge";
import { RESULT_ICONS } from "@/components/test-runs/test-run-meta";

const ICON_MOTION = {
	full: {
		animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
		exit: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
		initial: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
		transition: { bounce: 0, duration: 0.3, type: "spring" },
	},
	reduced: {
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		initial: { opacity: 0 },
		transition: { duration: 0.12 },
	},
} as const;

/** 执行结果标签。结果切换时图标交叉淡入 */
export function RunCaseResultBadge({
	result,
	size = "md",
}: {
	result: TestRunCaseResult;
	size?: StatusBadgeProps["size"];
}) {
	const Icon = RESULT_ICONS[result];
	const v = ICON_MOTION[useReducedMotion() ? "reduced" : "full"];
	return (
		<StatusBadge
			icon={
				<AnimatePresence initial={false} mode="wait">
					<motion.span className="inline-flex" key={result} {...v}>
						<Icon aria-hidden="true" />
					</motion.span>
				</AnimatePresence>
			}
			kind="result"
			size={size}
			value={result}
		/>
	);
}
