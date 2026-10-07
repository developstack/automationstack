import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

export const ICON_MOTION = {
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

export function RunCaseResultBadge({ result }: { result: TestRunCaseResult }) {
	const Icon = RESULT_ICONS[result];
	const v = ICON_MOTION[useReducedMotion() ? "reduced" : "full"];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-sm ${RESULT_BADGE_CLASSES[result]}`}
		>
			<AnimatePresence initial={false} mode="wait">
				<motion.span key={result} {...v}>
					<Icon aria-hidden="true" className="size-4" />
				</motion.span>
			</AnimatePresence>
			{RESULT_LABELS[result]}
		</span>
	);
}
