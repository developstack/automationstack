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
	toggleTheme: (event: ThemeTransitionClick) => void;
	user: PublicUser;
}

export function useUserMenu(): UserMenuState {
	const user = useCurrentUser();
	const isDark = useThemeAppearance() === "dark";
	const logout = useLogout();
	const toggleTheme = useCallback(
		(event: ThemeTransitionClick) =>
			setThemeAppearance(isDark ? "light" : "dark", originFromEvent(event)),
		[isDark]
	);
	return { isDark, logout, toggleTheme, user };
}
