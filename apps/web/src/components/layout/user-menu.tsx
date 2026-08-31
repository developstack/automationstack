import type { PublicUser } from "@automationstack/db/schema/users";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@automationstack/ui/components/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { useCallback } from "react";

import {
	useCurrentUser,
	useResetSessionCache,
} from "@/components/auth/use-session";
import type { ThemeTransitionClick } from "@/components/theme/theme-transition";
import { originFromEvent } from "@/components/theme/theme-transition";
import {
	setThemeAppearance,
	useThemeAppearance,
} from "@/components/theme/use-theme";
import { orpc } from "@/utils/orpc";

/** 用户名首字符做头像：账号由管理员创建，没有上传头像这回事。 */
export function UserAvatar({ username }: { username: string }) {
	return (
		<span
			aria-hidden="true"
			className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-medium text-sidebar-primary-foreground text-xs"
		>
			{[...username][0] ?? "?"}
		</span>
	);
}

export function useLogout(): () => void {
	const router = useRouter();
	const resetCache = useResetSessionCache();
	const logout = useMutation(
		orpc.auth.logout.mutationOptions({
			onSuccess: async () => {
				await resetCache();
				await router.navigate({ replace: true, to: "/login" });
			},
		})
	);
	return useCallback(() => logout.mutate({}), [logout]);
}

interface UserMenuState {
	isDark: boolean;
	logout: () => void;
	/** 收事件是为了把点击坐标喂给主题揭示的圆心，见 theme-transition.ts。 */
	toggleTheme: (event: ThemeTransitionClick) => void;
	user: PublicUser;
}

/**
 * 菜单要用的四样东西一次备齐。
 *
 * 目前只有一级侧栏底部这一个出口，但当前用户、外观、登出、切主题这四条接线
 * 与渲染混在一起就不好挪；单拎出来，往后菜单换个位置也只是换个渲染。
 */
export function useUserMenu(): UserMenuState {
	const user = useCurrentUser();
	const isDark = useThemeAppearance() === "dark";
	const logout = useLogout();
	/*
	 * 这是主题切换的第二个入口（另一个是 components/theme/theme-toggle.tsx 那颗按钮）。
	 * 两处都必须把事件传下去：圆形揭示以点击处为圆心，菜单项在侧栏底部，从那里铺开
	 * 与从右上角那颗按钮铺开是两条完全不同的观感，不能其中一处退化成视口中心。
	 * 用键盘敲 Enter 选中菜单项时坐标是 0,0，originFromEvent 会改用菜单项自身的中心。
	 */
	const toggleTheme = useCallback(
		(event: ThemeTransitionClick) =>
			setThemeAppearance(isDark ? "light" : "dark", originFromEvent(event)),
		[isDark]
	);
	return { isDark, logout, toggleTheme, user };
}

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
