import { Button, buttonVariants } from "@automationstack/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	useCurrentUser,
	useResetSessionCache,
} from "@/components/auth/use-session";
import { useLogout } from "@/components/layout/user-menu";
import { PlatformUserField } from "@/components/platform-users/platform-user-field";
import { PlatformUserFormError } from "@/components/platform-users/platform-user-form-error";
import {
	PASSWORD_HINT,
	validatePassword,
} from "@/components/platform-users/platform-user-meta";
import { orpc } from "@/utils/orpc";

const HOME_PATH = "/projects";

interface ChangePasswordValues {
	confirmPassword: string;
	currentPassword: string;
	newPassword: string;
}

interface ChangePasswordErrors {
	confirmPassword: string | null;
	currentPassword: string | null;
	newPassword: string | null;
}

const EMPTY_VALUES: ChangePasswordValues = {
	confirmPassword: "",
	currentPassword: "",
	newPassword: "",
};

function validate(values: ChangePasswordValues): ChangePasswordErrors {
	return {
		confirmPassword:
			values.confirmPassword === values.newPassword
				? null
				: "两次输入的新密码不一致",
		currentPassword: values.currentPassword === "" ? "请输入当前密码" : null,
		newPassword: validatePassword(values.newPassword),
	};
}

function hasErrors(errors: ChangePasswordErrors): boolean {
	return Object.values(errors).some((message) => message !== null);
}

function useChangePasswordForm() {
	const router = useRouter();
	const resetCache = useResetSessionCache();
	const [values, setValues] = useState(EMPTY_VALUES);
	const [submitted, setSubmitted] = useState(false);

	const change = useMutation(
		orpc.auth.changePassword.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: async () => {
				toast.success("密码已修改");
				await resetCache();
				await router.navigate({ replace: true, to: HOME_PATH });
			},
		})
	);

	const errors = validate(values);
	const visibleErrors: ChangePasswordErrors = submitted
		? errors
		: { confirmPassword: null, currentPassword: null, newPassword: null };

	const onSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (hasErrors(validate(values))) {
				return;
			}
			change.mutate({
				currentPassword: values.currentPassword,
				newPassword: values.newPassword,
			});
		},
		[change, values]
	);

	const field = useCallback(
		(name: keyof ChangePasswordValues) => (value: string) =>
			setValues((previous) => ({ ...previous, [name]: value })),
		[]
	);

	return {
		error: change.error?.message,
		errors: visibleErrors,
		field,
		isPending: change.isPending,
		onSubmit,
		values,
	};
}

function ChangePasswordFooter({ forced }: { forced: boolean }) {
	const logout = useLogout();
	if (forced) {
		return (
			<Button onClick={logout} type="button" variant="outline">
				退出登录
			</Button>
		);
	}
	return (
		<Link className={buttonVariants({ variant: "outline" })} to={HOME_PATH}>
			返回
		</Link>
	);
}

type ChangePasswordFormState = ReturnType<typeof useChangePasswordForm>;

function ChangePasswordFields({ form }: { form: ChangePasswordFormState }) {
	return (
		<>
			<PlatformUserField
				autoComplete="current-password"
				error={form.errors.currentPassword}
				hint="用于确认是你本人"
				id="change-password-current"
				label="当前密码"
				onChange={form.field("currentPassword")}
				type="password"
				value={form.values.currentPassword}
			/>
			<PlatformUserField
				autoComplete="new-password"
				error={form.errors.newPassword}
				hint={PASSWORD_HINT}
				id="change-password-new"
				label="新密码"
				onChange={form.field("newPassword")}
				type="password"
				value={form.values.newPassword}
			/>
			<PlatformUserField
				autoComplete="new-password"
				error={form.errors.confirmPassword}
				hint="再输入一次新密码"
				id="change-password-confirm"
				label="确认新密码"
				onChange={form.field("confirmPassword")}
				type="password"
				value={form.values.confirmPassword}
			/>
		</>
	);
}

export function ChangePasswordForm() {
	const user = useCurrentUser();
	const form = useChangePasswordForm();
	const forced = user.mustChangePassword;

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>
					<h1>修改密码</h1>
				</CardTitle>
				<CardDescription>
					{forced
						? `账号「${user.username}」必须先修改密码，然后才能继续使用。`
						: `修改账号「${user.username}」的登录密码。`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
					noValidate={true}
					onSubmit={form.onSubmit}
				>
					<ChangePasswordFields form={form} />
					<PlatformUserFormError message={form.error} />
					<div className="flex justify-end gap-2">
						<ChangePasswordFooter forced={forced} />
						<Button disabled={form.isPending} type="submit">
							{form.isPending ? "保存中…" : "修改密码"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
