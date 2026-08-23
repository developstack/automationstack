import { Button } from "@automationstack/ui/components/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback } from "react";

import { setThemeAppearance, useThemeAppearance } from "./use-theme";

interface ThemeToggleProps {
	className?: string;
}

/*
 * 亮/暗切换。做成开关按钮而不是「切到 X」的动作按钮：
 * 名字固定为「深色模式」，状态由 aria-pressed 表达，读屏会念出「深色模式 切换按钮
 * 已按下 / 未按下」——名字与状态分开，切换后不会因为名字也跟着变而读成两个不同的控件。
 * 图标只是同一状态的视觉表示，对读屏隐藏，避免把状态念两遍。
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
	const appearance = useThemeAppearance();
	const isDark = appearance === "dark";
	const handleClick = useCallback(() => {
		setThemeAppearance(isDark ? "light" : "dark");
	}, [isDark]);

	return (
		<Button
			aria-label="深色模式"
			aria-pressed={isDark}
			className={className}
			onClick={handleClick}
			size="icon"
			variant="outline"
		>
			{isDark ? (
				<MoonIcon aria-hidden="true" className="icon-stroke-regular" />
			) : (
				<SunIcon aria-hidden="true" className="icon-stroke-regular" />
			)}
		</Button>
	);
}
