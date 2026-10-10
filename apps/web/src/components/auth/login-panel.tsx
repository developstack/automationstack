import { useQuery } from "@tanstack/react-query";
import { FlaskConicalIcon } from "lucide-react";

import { CasdoorLoginButton } from "@/components/auth/casdoor-login-button";
import { LoginEmergencySection } from "@/components/auth/login-emergency-section";
import { LoginErrorAlert } from "@/components/auth/login-error-alert";
import {
	type LoginMethods,
	loginDescriptionOf,
	loginMethodsOf,
} from "@/components/auth/login-methods";
import { LoginPasswordForm } from "@/components/auth/login-password-form";
import { useLoginRequest } from "@/components/auth/use-login-request";
import { BRAND_NAME } from "@/components/layout/sidebar-brand";
import { orpc } from "@/utils/orpc";

interface LoginPanelProps {
	/** Casdoor 登录失败时的提示。 */
	errorMessage: string | null;
	/** 登录后跳转的本站路径。 */
	redirectTo?: string;
}

function PasswordSection({
	methods,
	redirectTo,
}: {
	methods: LoginMethods;
	redirectTo?: string;
}) {
	const login = useLoginRequest(redirectTo);
	return methods.emergencyOnly ? (
		<LoginEmergencySection onLogin={login} />
	) : (
		<LoginPasswordForm onLogin={login} />
	);
}

/**
 * 登录页右栏：产品名、标题、说明，然后按 auth.config 显示 Casdoor 登录按钮、
 * 用户名密码表单，或两者都显示。
 */
export function LoginPanel({ errorMessage, redirectTo }: LoginPanelProps) {
	const config = useQuery(orpc.auth.config.queryOptions());
	const methods = loginMethodsOf(config.data);
	const showDivider = methods.password && methods.casdoorLoginUrl !== null;
	const showForgotPasswordHint = methods.password && !methods.emergencyOnly;

	return (
		<div className="flex w-full max-w-sm flex-col gap-8">
			<header className="flex flex-col gap-6">
				<p className="flex items-center gap-2 font-medium text-sm">
					<FlaskConicalIcon
						aria-hidden="true"
						className="icon-stroke-medium size-4"
					/>
					{BRAND_NAME}
				</p>
				<div className="flex flex-col gap-1.5">
					<h1 className="font-semibold text-2xl tracking-tight">登录</h1>
					<p className="text-muted-foreground text-sm">
						{loginDescriptionOf(methods)}
					</p>
				</div>
			</header>
			<div className="flex flex-col gap-4">
				{errorMessage === null ? null : (
					<LoginErrorAlert message={errorMessage} />
				)}
				{methods.casdoorLoginUrl === null ? null : (
					<CasdoorLoginButton
						redirectTo={redirectTo}
						url={methods.casdoorLoginUrl}
					/>
				)}
				{showDivider ? (
					<p className="text-center text-muted-foreground text-xs">或</p>
				) : null}
				{methods.password ? (
					<PasswordSection methods={methods} redirectTo={redirectTo} />
				) : null}
			</div>
			{showForgotPasswordHint ? (
				<p className="text-muted-foreground text-xs">
					忘记密码请联系平台管理员
				</p>
			) : null}
		</div>
	);
}
