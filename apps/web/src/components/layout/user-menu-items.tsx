import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@automationstack/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { KeyRoundIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react";

import type { ThemeTransitionClick } from "@/components/theme/theme-transition";

interface UserMenuItemsProps {
	canChangePassword: boolean;
	isDark: boolean;
	onLogout: () => void;
	onToggleTheme: (event: ThemeTransitionClick) => void;
	username: string;
}

export function UserMenuItems({
	canChangePassword,
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
				{canChangePassword ? (
					<DropdownMenuItem render={<Link to="/change-password" />}>
						<KeyRoundIcon aria-hidden="true" />
						修改密码
					</DropdownMenuItem>
				) : null}
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onLogout}>
				<LogOutIcon aria-hidden="true" />
				退出登录
			</DropdownMenuItem>
		</>
	);
}
