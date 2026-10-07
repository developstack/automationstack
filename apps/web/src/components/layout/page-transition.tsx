import { useParams } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type PageTransitionPhase = "pending" | "ready";

const ENTER_DURATION_S = 0.22;

const ENTER_REDUCED_DURATION_S = 0.12;

const ENTER_EASE_X1 = 0.2;
const ENTER_EASE_Y1 = 0;
const ENTER_EASE_X2 = 0;
const ENTER_EASE_Y2 = 1;
const ENTER_EASE = [
	ENTER_EASE_X1,
	ENTER_EASE_Y1,
	ENTER_EASE_X2,
	ENTER_EASE_Y2,
] as const;

const ENTER_FROM = { opacity: 0 };
const ENTER_TO = { opacity: 1 };
const ENTER_TRANSITION = {
	duration: ENTER_DURATION_S,
	ease: ENTER_EASE,
} as const;

const ENTER_TRANSITION_REDUCED = {
	duration: ENTER_REDUCED_DURATION_S,
	ease: ENTER_EASE,
} as const;

let hasPaintedOnce = false;

const selectParamsKey = (params: object) => JSON.stringify(params);

interface PageTransitionProps {
	children: ReactNode;
	className?: string;
	phase?: PageTransitionPhase;
}

export function PageTransition({
	children,
	className,
	phase,
}: PageTransitionProps) {
	const paramsKey = useParams({
		select: selectParamsKey,
		shouldThrow: false,
		strict: false,
	});

	return (
		<PageTransitionFrame className={className} key={paramsKey} phase={phase}>
			{children}
		</PageTransitionFrame>
	);
}

function PageTransitionFrame({
	children,
	className,
	phase,
}: PageTransitionProps) {
	const shouldReduceMotion = useReducedMotion();
	const [isFirstPaint] = useState(() => !hasPaintedOnce);

	useEffect(() => {
		hasPaintedOnce = true;
	}, []);

	const skipEnter = isFirstPaint || phase === "pending";

	return (
		<motion.main
			animate={ENTER_TO}
			className={className}
			id="main"
			initial={skipEnter ? false : ENTER_FROM}
			tabIndex={-1}
			transition={
				shouldReduceMotion === true
					? ENTER_TRANSITION_REDUCED
					: ENTER_TRANSITION
			}
		>
			{children}
		</motion.main>
	);
}
