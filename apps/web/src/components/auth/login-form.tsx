import { Button } from "@automationstack/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";

import { useResetSessionCache } from "@/components/auth/use-session";
import { orpc } from "@/utils/orpc";

interface LoginFormProps {
	redirectTo?: string;
}

interface LoginFieldProps {
	autoComplete: string;
	id: string;
	label: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	type?: string;
	value: string;
}

function LoginField({ id, label, type, ...props }: LoginFieldProps) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input id={id} required={true} type={type} {...props} />
		</div>
	);
}

function useLoginForm(redirectTo: string | undefined) {
	const router = useRouter();
	const resetCache = useResetSessionCache();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const login = useMutation(
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

	return {
		error: login.error,
		isPending: login.isPending,
		onPassword: useCallback(
			(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
			[]
		),
		onSubmit: useCallback(
			(event: FormEvent<HTMLFormElement>) => {
				event.preventDefault();
				login.mutate({ password, username });
			},
			[login, password, username]
		),
		onUsername: useCallback(
			(event: ChangeEvent<HTMLInputElement>) => setUsername(event.target.value),
			[]
		),
		password,
		username,
	};
}

export function LoginForm({ redirectTo }: LoginFormProps) {
	const form = useLoginForm(redirectTo);

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>登录</CardTitle>
				<CardDescription>
					账号由管理员统一创建；忘记密码请联系管理员重置。
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-4" onSubmit={form.onSubmit}>
					<LoginField
						autoComplete="username"
						id="login-username"
						label="用户名"
						onChange={form.onUsername}
						value={form.username}
					/>
					<LoginField
						autoComplete="current-password"
						id="login-password"
						label="密码"
						onChange={form.onPassword}
						type="password"
						value={form.password}
					/>
					{form.error ? (
						<p className="text-destructive text-xs" role="alert">
							{form.error.message}
						</p>
					) : null}
					<Button disabled={form.isPending} type="submit">
						{form.isPending ? "登录中…" : "登录"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
