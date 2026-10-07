"use client";

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
