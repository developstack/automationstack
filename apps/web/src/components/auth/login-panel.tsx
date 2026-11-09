import { LoginPanelContent } from "@/components/auth/login-panel-content";
import { useLoginRequest } from "@/components/auth/use-login-request";

interface LoginPanelProps {
	/** 登录后跳转的本站路径。 */
	redirectTo?: string;
}

/** 登录页右栏。登录请求由 useLoginRequest 发出。 */
export function LoginPanel({ redirectTo }: LoginPanelProps) {
	const login = useLoginRequest(redirectTo);
	return <LoginPanelContent onLogin={login} />;
}
