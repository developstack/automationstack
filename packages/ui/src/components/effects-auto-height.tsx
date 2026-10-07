"use client";

import {
	Slot,
	type WithAsChild,
} from "@automationstack/ui/components/animate-slot";
import { useAutoHeight } from "@automationstack/ui/hooks/use-auto-height";
import type {
	LegacyAnimationControls,
	TargetAndTransition,
	Transition,
} from "motion/react";
import { type HTMLMotionProps, motion } from "motion/react";
import type { DependencyList, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

type AutoHeightProps = WithAsChild<
	{
		animate?: LegacyAnimationControls | TargetAndTransition;
		children: ReactNode;
		deps?: DependencyList;
		transition?: Transition;
	} & Omit<HTMLMotionProps<"div">, "animate">
>;

const DEFAULT_TRANSITION: Transition = {
	bounce: 0,
	damping: 30,
	restDelta: 0.01,
	stiffness: 300,
	type: "spring",
};

function AutoHeight({
	children,
	deps = [],
	transition = DEFAULT_TRANSITION,
	style,
	animate,
	asChild = false,
	...props
}: AutoHeightProps) {
	const { height, ref } = useAutoHeight<HTMLDivElement>(deps);
	const containerStyle = { overflow: "hidden" as const, ...style };
	const target = { height, ...animate };

	if (asChild) {
		const element = children as ReactElement<{ children?: ReactNode }>;
		return (
			<Slot
				animate={target}
				style={containerStyle}
				transition={transition}
				{...props}
			>
				{cloneElement(
					element,
					undefined,
					<div ref={ref}>{element.props.children}</div>
				)}
			</Slot>
		);
	}

	return (
		<motion.div
			animate={target}
			style={containerStyle}
			transition={transition}
			{...props}
		>
			<div ref={ref}>{children}</div>
		</motion.div>
	);
}

export { AutoHeight, type AutoHeightProps };
