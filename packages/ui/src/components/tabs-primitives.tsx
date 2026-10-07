"use client";

import {
	AutoHeight,
	type AutoHeightProps,
} from "@automationstack/ui/components/effects-auto-height";
import {
	Highlight,
	HighlightItem,
} from "@automationstack/ui/components/effects-highlight";
import { useDataState } from "@automationstack/ui/hooks/use-data-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { Transition } from "motion/react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useMemo, useState } from "react";

interface TabsHighlightContextType {
	activeValue: string | null;
	setActiveValue: (value: string | null) => void;
}

const [TabsHighlightProvider, useTabsHighlight] =
	getStrictContext<TabsHighlightContextType>("TabsHighlightContext");

function Tabs(props: TabsPrimitive.Root.Props) {
	const [activeValue, setActiveValue] = useState<string | null>(null);

	const context = useMemo(
		() => ({ activeValue, setActiveValue }),
		[activeValue]
	);

	return (
		<TabsHighlightProvider value={context}>
			<TabsPrimitive.Root {...props} />
		</TabsHighlightProvider>
	);
}

interface TabsHighlightProps {
	asChild?: boolean;
	children: ReactNode;
	className?: string;
	containerClassName?: string;
	enabled?: boolean;
	style?: CSSProperties;
	transition?: Transition;
}

function TabsHighlight({
	asChild,
	children,
	className,
	containerClassName,
	enabled = true,
	style,
	transition,
}: TabsHighlightProps) {
	const { activeValue } = useTabsHighlight();

	return (
		<Highlight
			asChild={asChild}
			className={className}
			click={false}
			containerClassName={containerClassName}
			controlledItems
			enabled={enabled}
			hover={false}
			mode="parent"
			style={style}
			transition={transition}
			value={activeValue}
		>
			{children}
		</Highlight>
	);
}

type TabsListProps = TabsPrimitive.List.Props & {
	containerClassName?: string;
	highlightClassName?: string;
	highlightEnabled?: boolean;
	transition?: Transition;
};

function TabsList({
	children,
	containerClassName,
	highlightClassName,
	highlightEnabled,
	transition,
	...props
}: TabsListProps) {
	return (
		<TabsHighlight
			asChild
			className={highlightClassName}
			containerClassName={containerClassName}
			enabled={highlightEnabled}
			transition={transition}
		>
			<TabsPrimitive.List {...props}>{children}</TabsPrimitive.List>
		</TabsHighlight>
	);
}

function useActiveTab<T extends HTMLElement>(
	itemValue: string,
	forwardedRef?: Ref<T | null>
) {
	const { setActiveValue } = useTabsHighlight();
	const [state, ref] = useDataState<T>("active", forwardedRef);

	useEffect(() => {
		if (state === true) {
			setActiveValue(itemValue);
		}
	}, [state, itemValue, setActiveValue]);

	return ref;
}

function TabsTab({ ref, ...props }: TabsPrimitive.Tab.Props) {
	const itemValue = String(props.value);
	const activeRef = useActiveTab<HTMLButtonElement>(itemValue, ref);

	return (
		<HighlightItem asChild value={itemValue}>
			<TabsPrimitive.Tab ref={activeRef} {...props} />
		</HighlightItem>
	);
}

function TabsPanel(props: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel {...props} />;
}

function TabsPanels(props: AutoHeightProps) {
	const { activeValue } = useTabsHighlight();

	return <AutoHeight {...props} deps={[activeValue, ...(props.deps ?? [])]} />;
}

export {
	Tabs,
	TabsHighlight,
	type TabsHighlightProps,
	TabsList,
	type TabsListProps,
	TabsPanel,
	TabsPanels,
	TabsTab,
	useTabsHighlight,
};
