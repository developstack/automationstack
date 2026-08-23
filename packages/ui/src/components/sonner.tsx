"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/*
 * 刻意偏离上游的两处，其余（icons / style 四个 CSS 变量 / toastOptions / className）
 * 都是 base-vega registry 原件：
 *
 * 1. 主题来源。上游写的是 `const { theme = "system" } = useTheme()`，依赖
 *    next-themes。本仓库不是 Next.js，且 pnpm-workspace.yaml 的 minimumReleaseAge
 *    供应链策略下不新增依赖，所以主题改为由调用方解析好再作为 prop 传进来
 *    （见 apps/web/src/routes/__root.tsx 的 `<Toaster theme={appearance} />`）。
 *    默认值 "system" 与上游 useTheme 的默认值一致。
 * 2. containerAriaLabel。sonner 的默认值是英文 "Notifications"，本应用是中文界面，
 *    读屏会念出一句外语。上游不提供这个 prop 只是因为它面向英文站点。
 */
const Toaster = ({ theme = "system", ...props }: ToasterProps) => (
	<Sonner
		className="toaster group"
		containerAriaLabel="通知"
		icons={{
			error: <OctagonXIcon className="size-4" />,
			info: <InfoIcon className="size-4" />,
			loading: <Loader2Icon className="size-4 animate-spin" />,
			success: <CircleCheckIcon className="size-4" />,
			warning: <TriangleAlertIcon className="size-4" />,
		}}
		style={
			{
				"--border-radius": "var(--radius)",
				"--normal-bg": "var(--popover)",
				"--normal-border": "var(--border)",
				"--normal-text": "var(--popover-foreground)",
			} as React.CSSProperties
		}
		theme={theme}
		toastOptions={{
			classNames: {
				toast: "cn-toast",
			},
		}}
		{...props}
	/>
);

export { Toaster };
