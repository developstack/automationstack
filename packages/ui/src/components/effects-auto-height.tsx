"use client";

/**
 * animate-ui 的 auto-height 效果层，vendored 自上游
 * `registry/primitives/effects/auto-height`。
 *
 * 做的事：外层容器 overflow:hidden 并把 height 动画到内层实测高度，内层保持
 * 自然高度。`height: auto` 不可插值，所以必须先由 useAutoHeight 换成具体像素。
 *
 * 动效可打断性（本仓 tooltip.tsx 顶部那条既有决定要求交代）：这里用的是 motion
 * 的 spring，不是关键帧。spring 从当前速度与当前值接着走，动画中途改目标不会
 * 跳回起点重播，因此满足那条约束。
 *
 * 与上游的差别：
 * - import 路径按本仓别名改写；`@base-ui-components/react` 旧包名在这一层用不到。
 * - 上游用 `const Comp = asChild ? Slot : motion.div` 再统一渲染，两者 props 类型
 *   不同，在本仓的 tsc 下会炸；改成在 JSX 里分两支，类型各自收敛。
 * - 上游的 asChild 分支把 `<div ref={测量}>` 整个交给 Slot，Slot 会把它就地升格成
 *   那个带 overflow:hidden 与 height 动画的容器本身——于是量的是被自己钳住的高度，
 *   成了闭环，高度会卡在首次测量值。这里改成让调用方的元素当容器、测量 div 留在
 *   它内部，量的才是内容的自然高度。
 */

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
