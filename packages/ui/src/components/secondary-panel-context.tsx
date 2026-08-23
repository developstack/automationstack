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

/**
 * 展开态宽度。与一级侧边栏取同一个 16rem：两列并排时等宽读起来是「同一套导航的两级」，
 * 一宽一窄反而像两个不相干的区域。
 */
export const SECONDARY_PANEL_WIDTH = "16rem";
/** 抽屉态宽度：窄屏下这块面板是当时唯一可见的列，比展开态再宽一点才放得下长条目名。 */
export const SECONDARY_PANEL_WIDTH_MOBILE = "18rem";

/** 与一级侧边栏同理：展开位存 cookie 而不是 localStorage，SSR 首帧就要知道，否则会闪一下。 */
export const SECONDARY_PANEL_COOKIE = "secondary_panel_state";
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;
const SECONDARY_PANEL_COOKIE_DAYS = 365;
const SECONDARY_PANEL_COOKIE_MAX_AGE =
	SECONDARY_PANEL_COOKIE_DAYS * SECONDS_PER_DAY;

/*
 * 两个宽度都下沉成 CSS 变量，理由和 sidebarLayoutStyle 一样：
 * 面板本体、收起动画、抽屉三处要用同一个数，写在样式类里就会散成三份。
 * 变量名带 secondary 前缀，与 --sidebar-width 互不覆盖——二级面板是嵌在
 * 一级侧边栏的 wrapper 里面的，同名变量会被就近继承覆盖掉。
 */
const panelLayoutStyle = {
	"--secondary-panel-width": SECONDARY_PANEL_WIDTH,
	"--secondary-panel-width-mobile": SECONDARY_PANEL_WIDTH_MOBILE,
} as CSSProperties;

interface SecondaryPanelContextValue {
	/** 视口窄到用抽屉承载二级面板。 */
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
	/**
	 * 首帧的展开状态。调用方从 `secondary_panel_state` cookie 里读（服务端读请求头、
	 * 客户端读 document.cookie），两端读到同一个值才不会水合不一致。
	 */
	defaultOpen?: boolean;
}

/*
 * 刻意不注册任何键盘快捷键。
 *
 * ⌘B 已经归一级侧边栏（sidebar-context.tsx 的 useToggleShortcut），二级面板再抢一个
 * 全局键要么和它撞、要么占掉浏览器/编辑器里已有语义的组合键，而这类冲突只有用户按下去
 * 才发现。取舍是：二级面板的开关只走 SecondaryPanelTrigger——它是可聚焦的按钮，
 * Tab 到它按 Enter 就是完整的键盘路径，无障碍上并不欠债；少掉的只是「不用移动焦点就能收」
 * 这一点便利，不值得用一个全局按键去换。
 */
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
			{/*
			 * 与 SidebarProvider 的 wrapper 不同，这里是 min-h-0 + flex-1 而不是 min-h-svh：
			 * 二级面板活在一级侧边栏的主内容区里，高度由外层的 flex 分配，
			 * 再要一次 svh 会把内容顶出可视区、让页面整体多出一段滚动。
			 */}
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
