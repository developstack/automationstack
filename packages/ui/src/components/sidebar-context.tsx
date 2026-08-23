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

/**
 * 展开态宽度。13rem 是从内容量倒推的，不是沿用旧值：模块树早已搬进二级面板，
 * 这一栏只剩品牌行 + 至多三个一级入口 + 用户区，16rem 里有 60px 以上是纯粹的空。
 *
 * 下限这样算（border-box）：品牌行内部 px-2(16) + 图标 16 + gap-2(8) + 品牌名
 * 「测试用例平台」6 个汉字 text-sm 约 84 = 124px，右侧并排的收起按钮 size-8(32)
 * 与它隔着 gap-1(4)，外面还有 SidebarHeader 的 p-2(16)——合计 176px = 11rem，
 * 再窄品牌名就要 truncate。13rem 在下限之上留 32px，够品牌名将来长一两个字；
 * 低于 12rem 余量只剩 16px，别再往下调。
 */
export const SIDEBAR_WIDTH = "13rem";
/** 抽屉态宽度：窄屏上要放下模块树的多级缩进，比展开态再宽一点。 */
export const SIDEBAR_WIDTH_MOBILE = "18rem";
/**
 * 收起态宽度。收起不再是整块滑走，而是留一条只剩图标的轨（icon rail）：
 * 3rem 刚好容下 32px 的正方形图标格加左右各 8px 的呼吸，导航入口始终可见。
 */
export const SIDEBAR_WIDTH_ICON = "3rem";

/** 收起状态存 cookie 而不是 localStorage：SSR 首帧就要知道，否则会闪一下。 */
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
	/** 视口窄到用抽屉承载侧边栏。 */
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
	/**
	 * 首帧的展开状态。调用方从 `sidebar_state` cookie 里读（服务端读请求头、
	 * 客户端读 document.cookie），两端读到同一个值才不会水合不一致。
	 */
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
