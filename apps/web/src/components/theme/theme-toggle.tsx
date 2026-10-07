import { Button } from "@automationstack/ui/components/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback } from "react";

import type { ThemeTransitionClick } from "./theme-transition";
import { originFromEvent } from "./theme-transition";
import { setThemeAppearance, useThemeAppearance } from "./use-theme";

interface ThemeToggleProps {
	className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
	const appearance = useThemeAppearance();
	const isDark = appearance === "dark";
	const handleClick = useCallback(
		(event: ThemeTransitionClick) => {
			setThemeAppearance(isDark ? "light" : "dark", originFromEvent(event));
		},
		[isDark]
	);

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
