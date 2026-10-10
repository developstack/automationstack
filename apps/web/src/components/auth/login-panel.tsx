import { useQuery } from "@tanstack/react-query";

import { loginMethodsOf } from "@/components/auth/login-methods";
import { LoginPanelContent } from "@/components/auth/login-panel-content";
import { useLoginRequest } from "@/components/auth/use-login-request";
import { orpc } from "@/utils/orpc";

interface LoginPanelProps {
	/** Casdoor 登录失败时的提示。 */
	errorMessage: string | null;
	/** 登录后跳转的本站路径。 */
	redirectTo?: string;
}

/** 登录页右栏：读取 auth.config 决定生效的认证方式，登录请求由 useLoginRequest 发出。 */
export function LoginPanel({ errorMessage, redirectTo }: LoginPanelProps) {
	const config = useQuery(orpc.auth.config.queryOptions());
	const login = useLoginRequest(redirectTo);

	return (
		<LoginPanelContent
			errorMessage={errorMessage}
			methods={loginMethodsOf(config.data)}
			onLogin={login}
			redirectTo={redirectTo}
		/>
	);
}
