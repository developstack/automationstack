"use client";

import {
	Highlight,
	HighlightItem,
	type HighlightItemProps,
	type HighlightProps,
} from "@automationstack/ui/components/effects-highlight";
import { useDataState } from "@automationstack/ui/hooks/use-data-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { Ref } from "react";
import { useEffect, useMemo, useState } from "react";

interface MenuHighlightContextType {
	highlightedValue: string | null;
	setHighlightedValue: (value: string | null) => void;
}

const [MenuHighlightProvider, useMenuHighlight] =
	getStrictContext<MenuHighlightContextType>("MenuHighlightContext");

function Menu(props: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger {...props} />;
}

function ContextMenuRoot(props: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root {...props} />;
}

function ContextMenuTrigger(props: ContextMenuPrimitive.Trigger.Props) {
	return <ContextMenuPrimitive.Trigger {...props} />;
}

function MenuPortal(props: MenuPrimitive.Portal.Props) {
	return <MenuPrimitive.Portal {...props} />;
}

function MenuPositioner(props: MenuPrimitive.Positioner.Props) {
	return <MenuPrimitive.Positioner {...props} />;
}

function MenuPopup(props: MenuPrimitive.Popup.Props) {
	return <MenuPrimitive.Popup {...props} />;
}

function MenuArrow(props: MenuPrimitive.Arrow.Props) {
	return <MenuPrimitive.Arrow {...props} />;
}

function MenuGroup(props: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group {...props} />;
}

function MenuGroupLabel(props: MenuPrimitive.GroupLabel.Props) {
	return <MenuPrimitive.GroupLabel {...props} />;
}

function MenuSeparator(props: MenuPrimitive.Separator.Props) {
	return <MenuPrimitive.Separator {...props} />;
}

function MenuSubmenuRoot(props: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot {...props} />;
}

function MenuCheckboxItemIndicator(
	props: MenuPrimitive.CheckboxItemIndicator.Props
) {
	return <MenuPrimitive.CheckboxItemIndicator {...props} />;
}

function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
	return <MenuPrimitive.RadioGroup {...props} />;
}

function MenuRadioItemIndicator(props: MenuPrimitive.RadioItemIndicator.Props) {
	return <MenuPrimitive.RadioItemIndicator {...props} />;
}

type MenuHighlightProps = Omit<
	HighlightProps,
	"click" | "controlledItems" | "hover" | "value"
>;

function MenuHighlight({ children, ...props }: MenuHighlightProps) {
	const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

	const context = useMemo(
		() => ({ highlightedValue, setHighlightedValue }),
		[highlightedValue]
	);

	return (
		<MenuHighlightProvider value={context}>
			<Highlight
				click={false}
				controlledItems
				hover={false}
				value={highlightedValue}
				{...props}
			>
				{children}
			</Highlight>
		</MenuHighlightProvider>
	);
}

function MenuHighlightItem(props: HighlightItemProps) {
	return <HighlightItem {...props} />;
}

function useHighlightedItem<T extends HTMLElement>(
	forwardedRef?: Ref<T | null>
) {
	const { setHighlightedValue } = useMenuHighlight();
	const [state, ref] = useDataState<T>("highlighted", forwardedRef);

	useEffect(() => {
		if (state !== true) {
			return;
		}
		const element = ref.current;
		const next = element?.dataset.value || element?.id || null;
		if (next) {
			setHighlightedValue(next);
		}
	}, [state, ref, setHighlightedValue]);

	return ref;
}

function MenuItem({ ref, ...props }: MenuPrimitive.Item.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.Item ref={highlightedRef} {...props} />;
}

function MenuSubmenuTrigger({
	ref,
	...props
}: MenuPrimitive.SubmenuTrigger.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.SubmenuTrigger ref={highlightedRef} {...props} />;
}

function MenuCheckboxItem({ ref, ...props }: MenuPrimitive.CheckboxItem.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.CheckboxItem ref={highlightedRef} {...props} />;
}

function MenuRadioItem({ ref, ...props }: MenuPrimitive.RadioItem.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.RadioItem ref={highlightedRef} {...props} />;
}

export {
	ContextMenuRoot,
	ContextMenuTrigger,
	Menu,
	MenuArrow,
	MenuCheckboxItem,
	MenuCheckboxItemIndicator,
	MenuGroup,
	MenuGroupLabel,
	MenuHighlight,
	MenuHighlightItem,
	type MenuHighlightProps,
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRadioGroup,
	MenuRadioItem,
	MenuRadioItemIndicator,
	MenuSeparator,
	MenuSubmenuRoot,
	MenuSubmenuTrigger,
	MenuTrigger,
	useMenuHighlight,
};
