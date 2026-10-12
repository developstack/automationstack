import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import type { LoginCredentials } from "@/components/auth/login-password-form";
import { useResetSessionCache } from "@/components/auth/use-session";
import { orpc } from "@/utils/orpc";

/**
 * 内置认证的登录请求，用作 LoginPasswordForm 的 onLogin。
 * 成功后重置会话缓存，然后跳转到 redirectTo（默认是项目列表）。
 * 失败时 reject 原始错误，由表单显示提示，所以不弹出全局的错误 toast。
 */
export function useLoginRequest(
	redirectTo: string | undefined
): (credentials: LoginCredentials) => Promise<void> {
	const router = useRouter();
	const resetCache = useResetSessionCache();
	const { mutateAsync } = useMutation(
		orpc.auth.login.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: async () => {
				await resetCache();
				await router.navigate({
					href: redirectTo ?? "/projects",
					replace: true,
				});
			},
		})
	);

	return useCallback(
		async (credentials: LoginCredentials) => {
			await mutateAsync(credentials);
		},
		[mutateAsync]
	);
}
