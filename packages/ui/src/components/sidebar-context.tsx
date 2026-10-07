"use client";

import { useCompactViewport } from "@automationstack/ui/hooks/use-compact-viewport";
import { cn } from "@automationstack/ui/lib/utils";
import type { ComponentProps, CSSProperties } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export const SIDEBAR_WIDTH = "13rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";

export const SIDEBAR_COOKIE = "sidebar_state";
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;
const SIDEBAR_COOKIE_DAYS = 365;
const SIDEBAR_COOKIE_MAX_AGE = SIDEBAR_COOKIE_DAYS * SECONDS_PER_DAY;
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

const sidebarLayoutStyle = {
	"--sidebar-width": SIDEBAR_WIDTH,
	"--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
	"--sidebar-width-negative": `calc(${SIDEBAR_WIDTH} * -1)`,
} as CSSProperties;

interface SidebarContextValue {
	isCompact: boolean;
	open: boolean;
	openMobile: boolean;
	setOpen: (open: boolean) => void;
	setOpenMobile: (open: boolean) => void;
	state: "collapsed" | "expanded";
	toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
	const context = useContext(SidebarContext);
	if (context === null) {
		throw new Error("useSidebar 必须在 SidebarProvider 内使用");
	}
	return context;
}

function persistOpen(open: boolean): void {
	// biome-ignore lint/suspicious/noDocumentCookie: 只写一个非敏感的展开位，用 CookieStore 要多兜一层可用性判断
	document.cookie = `${SIDEBAR_COOKIE}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}

function useToggleShortcut(toggleSidebar: () => void): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [toggleSidebar]);
}

export interface SidebarProviderProps extends ComponentProps<"div"> {
	defaultOpen?: boolean;
}

export function SidebarProvider({
	children,
	className,
	defaultOpen = true,
	style,
	...props
}: SidebarProviderProps) {
	const isCompact = useCompactViewport();
	const [open, setOpenState] = useState(defaultOpen);
	const [openMobile, setOpenMobile] = useState(false);

	const setOpen = useCallback((next: boolean) => {
		setOpenState(next);
		persistOpen(next);
	}, []);

	const toggleSidebar = useCallback(() => {
		if (isCompact) {
			setOpenMobile((current) => !current);
			return;
		}
		setOpenState((current) => {
			persistOpen(!current);
			return !current;
		});
	}, [isCompact]);

	useToggleShortcut(toggleSidebar);

	const value = useMemo<SidebarContextValue>(
		() => ({
			isCompact,
			open,
			openMobile,
			setOpen,
			setOpenMobile,
			state: open ? "expanded" : "collapsed",
			toggleSidebar,
		}),
		[isCompact, open, openMobile, setOpen, toggleSidebar]
	);

	return (
		<SidebarContext.Provider value={value}>
			<div
				className={cn("flex min-h-svh w-full", className)}
				data-slot="sidebar-wrapper"
				style={{ ...sidebarLayoutStyle, ...style }}
				{...props}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	);
}
