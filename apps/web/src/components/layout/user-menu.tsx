/**
 * 账户菜单的接线：当前用户、外观、登出、切主题。
 *
 * 渲染那两半已经各自成文件（user-avatar.tsx、user-menu-items.tsx），
 * 这里只留 hook——它们必须在菜单的宿主组件里调用，跟着 JSX 搬下去就会随子树
 * 挂载/卸载走。
 */
import type { PublicUser } from "@automationstack/db/schema/users";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
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
