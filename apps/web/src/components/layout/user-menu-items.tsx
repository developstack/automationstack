import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@automationstack/ui/components/dropdown-menu";
import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";

import type { ThemeTransitionClick } from "@/components/theme/theme-transition";

interface UserMenuItemsProps {
	isDark: boolean;
	onLogout: () => void;
	onToggleTheme: (event: ThemeTransitionClick) => void;
	username: string;
}

export function UserMenuItems({
	isDark,
	onLogout,
	onToggleTheme,
	username,
}: UserMenuItemsProps) {
	return (
		<>
			<DropdownMenuGroup>
				<DropdownMenuLabel>{username}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onToggleTheme}>
					{isDark ? (
						<SunIcon aria-hidden="true" />
					) : (
						<MoonIcon aria-hidden="true" />
					)}
					{isDark ? "切换到浅色" : "切换到深色"}
				</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onLogout}>
				<LogOutIcon aria-hidden="true" />
				退出登录
			</DropdownMenuItem>
		</>
	);
}
