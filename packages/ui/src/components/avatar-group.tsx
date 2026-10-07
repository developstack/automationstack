"use client";

import { cn } from "@automationstack/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
	Children,
	isValidElement,
	type ReactNode,
	useCallback,
	useState,
} from "react";

const LIFT_Y = "-30%";
const LIFT_SPRING = { damping: 17, stiffness: 300, type: "spring" } as const;
const LIFT_VARIANTS = { lift: { y: LIFT_Y }, rest: { y: 0 } };

interface AvatarGroupItemProps {
	children: ReactNode;
	lift: boolean;
	zIndex: number;
}

function AvatarGroupItem({ children, lift, zIndex }: AvatarGroupItemProps) {
	const [focused, setFocused] = useState(false);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleFocus = useCallback(() => setFocused(true), []);
	if (!lift) {
		return (
			<span className="relative" style={{ zIndex }}>
				{children}
			</span>
		);
	}
	return (
		<motion.span
			animate={focused ? "lift" : "rest"}
			className="relative"
			initial="rest"
			onBlur={handleBlur}
			onFocus={handleFocus}
			style={{ zIndex }}
			transition={LIFT_SPRING}
			variants={LIFT_VARIANTS}
			whileHover="lift"
			whileTap="lift"
		>
			{children}
		</motion.span>
	);
}

interface AvatarGroupProps {
	children: ReactNode;
	className?: string;
	lift?: boolean;
}

export function AvatarGroup({
	children,
	className,
	lift = true,
}: AvatarGroupProps) {
	const reduce = useReducedMotion();
	const animated = lift && reduce !== true;
	const items = Children.toArray(children).filter(isValidElement);
	return (
		<span
			className={cn("flex items-center", className)}
			data-slot="avatar-group"
		>
			{items.map((item, index) => (
				<AvatarGroupItem
					key={item.key}
					lift={animated}
					zIndex={items.length - index}
				>
					{item}
				</AvatarGroupItem>
			))}
		</span>
	);
}
