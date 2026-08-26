"use client";

import { SPRING_PRESS } from "@automationstack/ui/lib/ease";
import { useHoverCapable } from "@automationstack/ui/lib/hooks/use-hover-capable";
import { cn } from "@automationstack/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";

export interface NotFoundProps {
	browseHref?: string;
	browseLabel?: string;
	className?: string;
	/** The big status code. */
	code?: string;
	description?: string;
	homeHref?: string;
	homeLabel?: string;
	title?: string;
}

export const NOT_FOUND_DEFAULTS = {
	browseHref: "/components/motion",
	browseLabel: "Browse components",
	code: "404",
	description:
		"The page you are looking for moved, vanished, or never existed.",
	homeHref: "/",
	homeLabel: "Back home",
	title: "Page not found",
} as const;

type ActionsProps = Pick<
	NotFoundProps,
	"homeHref" | "homeLabel" | "browseHref" | "browseLabel" | "className"
>;

/** The shared dual CTA: a primary "Back home" and a secondary "Browse". */
export function NotFoundActions({
	homeHref = NOT_FOUND_DEFAULTS.homeHref,
	homeLabel = NOT_FOUND_DEFAULTS.homeLabel,
	browseHref = NOT_FOUND_DEFAULTS.browseHref,
	browseLabel = NOT_FOUND_DEFAULTS.browseLabel,
	className,
}: ActionsProps) {
	const reduce = useReducedMotion();
	const canHover = useHoverCapable();
	const whileTap = reduce ? undefined : { scale: 0.96 };
	const whileHover = reduce || !canHover ? undefined : { scale: 1.02 };

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-center gap-3",
				className
			)}
		>
			<motion.a
				className="inline-flex h-11 select-none items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
				href={homeHref}
				transition={SPRING_PRESS}
				whileHover={whileHover}
				whileTap={whileTap}
			>
				{homeLabel}
			</motion.a>
			<motion.a
				className="inline-flex h-11 select-none items-center justify-center rounded-full border border-border bg-card px-6 font-medium text-foreground text-sm transition-colors hover:bg-primary/5"
				href={browseHref}
				transition={SPRING_PRESS}
				whileHover={whileHover}
				whileTap={whileTap}
			>
				{browseLabel}
			</motion.a>
		</div>
	);
}

/** Centers a variant and gives it a consistent minimum stage height. */
export function NotFoundStage({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-h-[420px] w-full flex-col items-center justify-center gap-8 px-4 text-center",
				className
			)}
		>
			{children}
		</div>
	);
}
