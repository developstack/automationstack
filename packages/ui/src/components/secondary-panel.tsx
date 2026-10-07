"use client";

import { Button } from "@automationstack/ui/components/button";
import {
	SECONDARY_PANEL_WIDTH_MOBILE,
	useSecondaryPanel,
} from "@automationstack/ui/components/secondary-panel-context";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { cn } from "@automationstack/ui/lib/utils";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useCallback } from "react";

const FALLBACK_DRAWER_TITLE = "面板";

export interface SecondaryPanelProps extends ComponentProps<"div"> {
	header?: ReactNode;
	title?: string;
}

export function SecondaryPanel({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { isCompact } = useSecondaryPanel();
	if (isCompact) {
		return (
			<SecondaryPanelDrawer className={className} header={header} title={title}>
				{children}
			</SecondaryPanelDrawer>
		);
	}
	return (
		<SecondaryPanelColumn className={className} header={header} title={title}>
			{children}
		</SecondaryPanelColumn>
	);
}

function SecondaryPanelDrawer({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { openMobile, setOpenMobile } = useSecondaryPanel();
	return (
		<Sheet onOpenChange={setOpenMobile} open={openMobile}>
			<SheetContent
				className={cn(
					"w-(--secondary-panel-width-mobile) bg-sidebar text-sidebar-foreground",
					className
				)}
				showCloseButton={false}
				side="left"
				style={
					{
						"--secondary-panel-width-mobile": SECONDARY_PANEL_WIDTH_MOBILE,
					} as CSSProperties
				}
			>
				<SheetHeader
					className={
						title || header
							? "min-h-12 shrink-0 justify-center py-0"
							: "sr-only"
					}
				>
					<SheetTitle className={header ? "sr-only" : "truncate"}>
						{title ?? FALLBACK_DRAWER_TITLE}
					</SheetTitle>
					{header}
				</SheetHeader>
				<div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
					{children}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function SecondaryPanelColumn({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { state } = useSecondaryPanel();
	return (
		<div
			className="hidden w-(--secondary-panel-width) shrink-0 overflow-hidden transition-secondary-panel data-[state=collapsed]:w-0 lg:flex"
			data-slot="secondary-panel"
			data-state={state}
		>
			<div
				className={cn(
					"flex w-(--secondary-panel-width) shrink-0 flex-col border-sidebar-border border-r bg-sidebar",
					className
				)}
				data-slot="secondary-panel-surface"
			>
				{title || header ? (
					<div
						className="flex min-h-12 shrink-0 items-center gap-2 px-4"
						data-slot="secondary-panel-header"
					>
						{header ?? (
							<span className="truncate font-medium text-sm">{title}</span>
						)}
					</div>
				) : null}
				<div
					className="flex min-h-0 flex-1 flex-col overflow-y-auto"
					data-slot="secondary-panel-content"
				>
					{children}
				</div>
			</div>
		</div>
	);
}

type TriggerClickEvent = Parameters<
	NonNullable<ComponentProps<typeof Button>["onClick"]>
>[0];

export interface SecondaryPanelTriggerProps
	extends ComponentProps<typeof Button> {
	label: string;
}

export function SecondaryPanelTrigger({
	children,
	className,
	label,
	onClick,
	...props
}: SecondaryPanelTriggerProps) {
	const { isCompact, open, openMobile, toggle } = useSecondaryPanel();
	const handleClick = useCallback(
		(event: TriggerClickEvent) => {
			onClick?.(event);
			toggle();
		},
		[onClick, toggle]
	);
	const expanded = isCompact ? openMobile : open;
	return (
		<Button
			aria-expanded={expanded}
			aria-label={label}
			className={className}
			data-slot="secondary-panel-trigger"
			onClick={handleClick}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children}
		</Button>
	);
}
