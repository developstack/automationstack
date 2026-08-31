/**
 * 账户菜单里的那几项，自 user-menu.tsx 拆出。
 * 接线（当前用户、外观、登出、切主题）仍在那边的 useUserMenu 里，这里只剩渲染。
 */
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

/**
 * 菜单项：用户名、主题、退出登录。
 *
 * 「成员管理」不在这里——它是一级侧栏的一条导航项，菜单里再放一条就是同一去处
 * 的第二颗按钮，而两处的可见性（仅管理员）还得各维护一份。
 */
export function UserMenuItems({
	isDark,
	onLogout,
	onToggleTheme,
	username,
}: UserMenuItemsProps) {
	return (
		<>
			{/*
			 * 用户名渲染的是 Base UI 的 GroupLabel，没有 Group 祖先就拿不到 context，
			 * 菜单一展开就整页崩。标签和它命名的那一项装在同一个组里，分隔线放进组内
			 * 只是拉开视觉距离——若把标签单独切成一组，读屏会先念到一个有名字却空无一物
			 * 的组，再念一个没名字的组。
			 */}
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
