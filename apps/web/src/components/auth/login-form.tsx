import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useQuery } from "@tanstack/react-query";

import { CasdoorLoginButton } from "@/components/auth/casdoor-login-button";
import {
	loginDescriptionOf,
	loginMethodsOf,
} from "@/components/auth/login-methods";
import { LoginPasswordForm } from "@/components/auth/login-password-form";
import { orpc } from "@/utils/orpc";

interface LoginFormProps {
	redirectTo?: string;
}

/** 登录页按 auth.config 显示用户名密码表单、Casdoor 登录按钮，或两者都显示。 */
export function LoginForm({ redirectTo }: LoginFormProps) {
	const config = useQuery(orpc.auth.config.queryOptions());
	const methods = loginMethodsOf(config.data);
	const showDivider = methods.password && methods.casdoorLoginUrl !== null;

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>登录</CardTitle>
				<CardDescription>{loginDescriptionOf(methods)}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{methods.password ? (
					<LoginPasswordForm redirectTo={redirectTo} />
				) : null}
				{showDivider ? (
					<p className="text-center text-muted-foreground text-xs">或</p>
				) : null}
				{methods.casdoorLoginUrl === null ? null : (
					<CasdoorLoginButton url={methods.casdoorLoginUrl} />
				)}
			</CardContent>
		</Card>
	);
}
