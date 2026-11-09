import { Button } from "@automationstack/ui/components/button";
import { Loader2Icon } from "lucide-react";
import { type FormEvent, useCallback, useId, useRef, useState } from "react";

import { LoginErrorAlert } from "@/components/auth/login-error-alert";
import { loginFailureOf } from "@/components/auth/login-failure";
import { LoginField } from "@/components/auth/login-field";

export interface LoginCredentials {
	password: string;
	username: string;
}

export interface LoginPasswordFormProps {
	/**
	 * 发出登录请求。成功时 resolve，表单保持 loading 状态，直到页面跳转。
	 * 失败时 reject oRPC 客户端的原始错误（ORPCError 或网络错误），表单按错误显示提示。
	 */
	onLogin: (credentials: LoginCredentials) => Promise<void>;
}

interface FieldErrors {
	password: string | null;
	username: string | null;
}

const NO_FIELD_ERRORS: FieldErrors = { password: null, username: null };

function validate(credentials: LoginCredentials): FieldErrors {
	return {
		password: credentials.password === "" ? "请输入密码" : null,
		username: credentials.username.trim() === "" ? "请输入用户名" : null,
	};
}

// 修改任一输入框后，清除字段错误和"用户名或密码错误"。提示区的提示保留到下次提交
function useLoginFields() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState(NO_FIELD_ERRORS);
	const onUsername = useCallback((value: string) => {
		setUsername(value);
		setFieldErrors(NO_FIELD_ERRORS);
	}, []);
	const onPassword = useCallback((value: string) => {
		setPassword(value);
		setFieldErrors(NO_FIELD_ERRORS);
	}, []);
	return {
		fieldErrors,
		onPassword,
		onUsername,
		password,
		passwordRef: useRef<HTMLInputElement>(null),
		setFieldErrors,
		username,
		usernameRef: useRef<HTMLInputElement>(null),
	};
}

function useLoginPasswordForm(onLogin: LoginPasswordFormProps["onLogin"]) {
	const fields = useLoginFields();
	const { password, passwordRef, setFieldErrors, username, usernameRef } =
		fields;
	const [alertMessage, setAlertMessage] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	const handleFailure = useCallback(
		(error: unknown) => {
			setIsPending(false);
			const failure = loginFailureOf(error);
			if (failure.kind === "credentials") {
				setFieldErrors({ password: failure.message, username: null });
				passwordRef.current?.focus();
				return;
			}
			setAlertMessage(failure.message);
		},
		[passwordRef, setFieldErrors]
	);

	const onSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (isPending) {
				return;
			}
			const credentials = { password, username };
			const errors = validate(credentials);
			setFieldErrors(errors);
			setAlertMessage(null);
			if (errors.username !== null || errors.password !== null) {
				(errors.username === null ? passwordRef : usernameRef).current?.focus();
				return;
			}
			setIsPending(true);
			onLogin(credentials).catch(handleFailure);
		},
		[
			handleFailure,
			isPending,
			onLogin,
			password,
			passwordRef,
			setFieldErrors,
			username,
			usernameRef,
		]
	);

	return { ...fields, alertMessage, isPending, onSubmit };
}

/**
 * 用户名密码表单：提交时校验，按错误类型显示提示，请求期间显示 loading。
 * 表单不发请求，由调用方通过 onLogin 发出。
 */
export function LoginPasswordForm({ onLogin }: LoginPasswordFormProps) {
	const idPrefix = useId();
	const form = useLoginPasswordForm(onLogin);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.onSubmit}
		>
			<LoginField
				autoComplete="username"
				error={form.fieldErrors.username}
				id={`${idPrefix}-username`}
				inputRef={form.usernameRef}
				label="用户名"
				onChange={form.onUsername}
				value={form.username}
			/>
			<LoginField
				autoComplete="current-password"
				error={form.fieldErrors.password}
				id={`${idPrefix}-password`}
				inputRef={form.passwordRef}
				label="密码"
				onChange={form.onPassword}
				type="password"
				value={form.password}
			/>
			{form.alertMessage === null ? null : (
				<LoginErrorAlert message={form.alertMessage} />
			)}
			<Button disabled={form.isPending} type="submit">
				{form.isPending ? (
					<>
						<Loader2Icon
							aria-hidden="true"
							className="animate-spin"
							data-icon="inline-start"
						/>
						登录中…
					</>
				) : (
					"登录"
				)}
			</Button>
		</form>
	);
}
