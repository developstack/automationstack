import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useQuery } from "@tanstack/react-query";

import { CasdoorLoginButton } from "@/components/auth/casdoor-login-button";
import { LoginEmergencySection } from "@/components/auth/login-emergency-section";
import { LoginErrorAlert } from "@/components/auth/login-error-alert";
import {
	type LoginMethods,
	loginDescriptionOf,
	loginMethodsOf,
} from "@/components/auth/login-methods";
import { LoginPasswordForm } from "@/components/auth/login-password-form";
import { orpc } from "@/utils/orpc";

interface LoginFormProps {
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
	if (!methods.password) {
		return null;
	}
	return methods.emergencyOnly ? (
		<LoginEmergencySection redirectTo={redirectTo} />
	) : (
		<LoginPasswordForm redirectTo={redirectTo} />
	);
}

/** 登录页按 auth.config 显示 Casdoor 登录按钮、用户名密码表单，或两者都显示。 */
export function LoginForm({ errorMessage, redirectTo }: LoginFormProps) {
	const config = useQuery(orpc.auth.config.queryOptions());
	const methods = loginMethodsOf(config.data);
	const showDivider = methods.password && methods.casdoorLoginUrl !== null;

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>
					<h1>登录</h1>
				</CardTitle>
				<CardDescription>{loginDescriptionOf(methods)}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
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
				<PasswordSection methods={methods} redirectTo={redirectTo} />
			</CardContent>
		</Card>
	);
}
