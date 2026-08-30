"use client";

/* Animate UI 的 base collapsible primitive（上游
   registry/primitives/base/collapsible），vendored 进来。与上游源码的共同出入
   见 tooltip-primitives.tsx（包名 / props 类型 / reduced-motion）。Panel 另有两条：

   1. hidden={false} 与 keepMounted 写在展开之后。开合期间面板必须在 DOM 里
      且可见，否则 motion 拿不到高度也画不出退场，这不是调用方的选项。
   2. 内联 transition-property: none。本仓的调用处会往 CollapsibleContent 上加
      globals.css 的 collapsible-panel 工具类（apps/web 有三处），那是同一个开合
      动画的 CSS transition 版；motion 逐帧往 style.height 里写值，外面再套一层
      150ms 的 height 过渡，等于两套实现串联，动画会拖尾。类名删不掉（调用处不归
      这里改），就在内联样式里把过渡关掉——内联优先级高于工具类，其余声明
      （height 基态、overflow）本来就会被 motion 的内联值盖住，互不打架。 */

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";

const INSTANT: Transition = { duration: 0 };
const PANEL_TRANSITION: Transition = { duration: 0.35, ease: "easeInOut" };
/** 展开时内容自下浮入的距离（px）。 */
const PANEL_OFFSET = 20;
const MASK =
	"linear-gradient(black var(--mask-stop), transparent var(--mask-stop))";
const PANEL_STYLE = {
	maskImage: MASK,
	overflow: "hidden",
	transitionProperty: "none",
	WebkitMaskImage: MASK,
} as const;
const CLOSED = {
	"--mask-stop": "0%",
	height: 0,
	opacity: 0,
	y: PANEL_OFFSET,
} as const;
const OPEN = {
	"--mask-stop": "100%",
	height: "auto",
	opacity: 1,
	y: 0,
} as const;

interface CollapsibleContextType {
	isOpen: boolean;
	setIsOpen: CollapsibleProps["onOpenChange"];
}

const [CollapsibleProvider, useCollapsible] =
	getStrictContext<CollapsibleContextType>("CollapsibleContext");

type CollapsibleProps = CollapsiblePrimitive.Root.Props;

function Collapsible(props: CollapsibleProps) {
	const [isOpen, setIsOpen] = useControlledState({
		defaultValue: props.defaultOpen,
		onChange: props.onOpenChange,
		value: props.open,
	});

	return (
		<CollapsibleProvider value={{ isOpen, setIsOpen }}>
			<CollapsiblePrimitive.Root
				data-slot="collapsible"
				{...props}
				onOpenChange={setIsOpen}
			/>
		</CollapsibleProvider>
	);
}

type CollapsibleTriggerProps = CollapsiblePrimitive.Trigger.Props;

function CollapsibleTrigger(props: CollapsibleTriggerProps) {
	return (
		<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
	);
}

type CollapsiblePanelProps = CollapsiblePrimitive.Panel.Props & {
	/** 关着也留在 DOM 里（表单校验、页内搜索需要时打开）。 */
	keepRendered?: boolean;
	transition?: Transition;
};

function CollapsiblePanel({
	keepRendered = false,
	transition = PANEL_TRANSITION,
	...props
}: CollapsiblePanelProps) {
	const { isOpen } = useCollapsible();
	const reduce = useReducedMotion();
	const resolved = reduce ? INSTANT : transition;

	/* keepRendered 时面板一直挂着，开合靠 animate 在两组目标值之间切；
	   不 keepRendered 时由 AnimatePresence 负责退场，用 exit。 */
	return (
		<AnimatePresence>
			{keepRendered ? (
				<CollapsiblePrimitive.Panel
					data-slot="collapsible-panel"
					{...props}
					hidden={false}
					keepMounted
					render={
						<motion.div
							animate={isOpen ? OPEN : CLOSED}
							initial={CLOSED}
							key="collapsible-panel"
							style={PANEL_STYLE}
							transition={resolved}
						/>
					}
				/>
			) : (
				isOpen && (
					<CollapsiblePrimitive.Panel
						data-slot="collapsible-panel"
						{...props}
						hidden={false}
						keepMounted
						render={
							<motion.div
								animate={OPEN}
								exit={CLOSED}
								initial={CLOSED}
								key="collapsible-panel"
								style={PANEL_STYLE}
								transition={resolved}
							/>
						}
					/>
				)
			)}
		</AnimatePresence>
	);
}

export {
	Collapsible,
	type CollapsibleContextType,
	CollapsiblePanel,
	type CollapsiblePanelProps,
	type CollapsibleProps,
	CollapsibleTrigger,
	type CollapsibleTriggerProps,
	useCollapsible,
};
