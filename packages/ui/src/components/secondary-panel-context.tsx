"use client";

import { useCompactViewport } from "@automationstack/ui/hooks/use-compact-viewport";
import { cn } from "@automationstack/ui/lib/utils";
import type { ComponentProps, CSSProperties } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export const SECONDARY_PANEL_WIDTH = "16rem";
export const SECONDARY_PANEL_WIDTH_MOBILE = "18rem";

export const SECONDARY_PANEL_COOKIE = "secondary_panel_state";
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;
const SECONDARY_PANEL_COOKIE_DAYS = 365;
const SECONDARY_PANEL_COOKIE_MAX_AGE =
	SECONDARY_PANEL_COOKIE_DAYS * SECONDS_PER_DAY;

const panelLayoutStyle = {
	"--secondary-panel-width": SECONDARY_PANEL_WIDTH,
	"--secondary-panel-width-mobile": SECONDARY_PANEL_WIDTH_MOBILE,
} as CSSProperties;

interface SecondaryPanelContextValue {
	isCompact: boolean;
	open: boolean;
	openMobile: boolean;
	setOpen: (open: boolean) => void;
	setOpenMobile: (open: boolean) => void;
	state: "collapsed" | "expanded";
	toggle: () => void;
}

const SecondaryPanelContext = createContext<SecondaryPanelContextValue | null>(
	null
);

export function useSecondaryPanel(): SecondaryPanelContextValue {
	const context = useContext(SecondaryPanelContext);
	if (context === null) {
		throw new Error("useSecondaryPanel 必须在 SecondaryPanelProvider 内使用");
	}
	return context;
}

function persistOpen(open: boolean): void {
	// biome-ignore lint/suspicious/noDocumentCookie: 只写一个非敏感的展开位，用 CookieStore 要多兜一层可用性判断
	document.cookie = `${SECONDARY_PANEL_COOKIE}=${open}; path=/; max-age=${SECONDARY_PANEL_COOKIE_MAX_AGE}; samesite=lax`;
}

export interface SecondaryPanelProviderProps extends ComponentProps<"div"> {
	defaultOpen?: boolean;
}

export function SecondaryPanelProvider({
	children,
	className,
	defaultOpen = true,
	style,
	...props
}: SecondaryPanelProviderProps) {
	const isCompact = useCompactViewport();
	const [open, setOpenState] = useState(defaultOpen);
	const [openMobile, setOpenMobile] = useState(false);

	const setOpen = useCallback((next: boolean) => {
		setOpenState(next);
		persistOpen(next);
	}, []);

	const toggle = useCallback(() => {
		if (isCompact) {
			setOpenMobile((current) => !current);
			return;
		}
		setOpenState((current) => {
			persistOpen(!current);
			return !current;
		});
	}, [isCompact]);

	const value = useMemo<SecondaryPanelContextValue>(
		() => ({
			isCompact,
			open,
			openMobile,
			setOpen,
			setOpenMobile,
			state: open ? "expanded" : "collapsed",
			toggle,
		}),
		[isCompact, open, openMobile, setOpen, toggle]
	);

	return (
		<SecondaryPanelContext.Provider value={value}>
			<div
				className={cn("flex min-h-0 w-full flex-1", className)}
				data-slot="secondary-panel-wrapper"
				style={{ ...panelLayoutStyle, ...style }}
				{...props}
			>
				{children}
			</div>
		</SecondaryPanelContext.Provider>
	);
}
