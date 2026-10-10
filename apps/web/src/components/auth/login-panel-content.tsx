import { FlaskConicalIcon } from "lucide-react";

import { CasdoorLoginButton } from "@/components/auth/casdoor-login-button";
import { LoginEmergencySection } from "@/components/auth/login-emergency-section";
import { LoginErrorAlert } from "@/components/auth/login-error-alert";
import {
	type LoginMethods,
	loginDescriptionOf,
} from "@/components/auth/login-methods";
import {
	LoginPasswordForm,
	type LoginPasswordFormProps,
} from "@/components/auth/login-password-form";
import { BRAND_NAME } from "@/components/layout/sidebar-brand";

export interface LoginPanelContentProps {
	/** Casdoor 登录失败时的提示。 */
	errorMessage: string | null;
	methods: LoginMethods;
	onLogin: LoginPasswordFormProps["onLogin"];
	/** 登录后跳转的本站路径。 */
	redirectTo?: string;
}

function LoginPanelHeader({ methods }: { methods: LoginMethods }) {
	return (
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
	);
}

/** 用户名密码表单：Casdoor 认证生效时是折叠的应急登录，内置认证生效时直接显示。 */
function PasswordSection({
	methods,
	onLogin,
}: Pick<LoginPanelContentProps, "methods" | "onLogin">) {
	if (!methods.password) {
		return null;
	}
	return methods.emergencyOnly ? (
		<LoginEmergencySection onLogin={onLogin} />
	) : (
		<LoginPasswordForm onLogin={onLogin} />
	);
}

/**
 * 登录页右栏的内容：产品名、标题、说明、Casdoor 登录失败的提示，
 * 然后按生效的认证方式显示 Casdoor 登录按钮、用户名密码表单，或两者都显示。
 */
export function LoginPanelContent({
	errorMessage,
	methods,
	onLogin,
	redirectTo,
}: LoginPanelContentProps) {
	const showDivider = methods.password && methods.casdoorLoginUrl !== null;
	const showForgotPasswordHint = methods.password && !methods.emergencyOnly;

	return (
		<div className="flex w-full max-w-sm flex-col gap-8">
			<LoginPanelHeader methods={methods} />
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
				<PasswordSection methods={methods} onLogin={onLogin} />
			</div>
			{showForgotPasswordHint ? (
				<p className="text-muted-foreground text-xs">
					忘记密码请联系平台管理员
				</p>
			) : null}
		</div>
	);
}
