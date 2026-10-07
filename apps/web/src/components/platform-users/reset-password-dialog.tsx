import type { PublicUser } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { PlatformUserField } from "@/components/platform-users/platform-user-field";
import { PlatformUserFormError } from "@/components/platform-users/platform-user-form-error";
import {
	PASSWORD_HINT,
	validatePassword,
} from "@/components/platform-users/platform-user-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

interface ResetPasswordFormProps {
	onClose: () => void;
	user: PublicUser;
}

function useResetPassword(user: PublicUser, onClose: () => void) {
	return useMutation(
		orpc.users.resetPassword.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				toast.success(`已重置「${user.username}」的密码`);
				onClose();
			},
		})
	);
}

function ResetPasswordForm({ onClose, user }: ResetPasswordFormProps) {
	const [password, setPassword] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const reset = useResetPassword(user, onClose);
	const passwordError =
		submitted || password !== "" ? validatePassword(password) : null;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (validatePassword(password) !== null) {
				return;
			}
			reset.mutate({ id: user.id, password });
		},
		[password, reset, user.id]
	);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<PlatformUserField
				autoComplete="new-password"
				error={passwordError}
				hint={PASSWORD_HINT}
				id="reset-password"
				label="新密码"
				onChange={setPassword}
				type="password"
				value={password}
			/>
			<PlatformUserFormError message={reset.error?.message} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={reset.isPending} type="submit">
					{reset.isPending ? "重置中…" : "重置密码"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface ResetPasswordDialogProps {
	onClose: () => void;
	user: PublicUser | null;
}

export function ResetPasswordDialog({
	onClose,
	user,
}: ResetPasswordDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={user !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>重置密码</DialogTitle>
					<DialogDescription>
						为「{user?.username}」设置新密码；对方已登录的窗口不会被强制退出。
					</DialogDescription>
				</DialogHeader>
				{user === null ? null : (
					<ResetPasswordForm onClose={onClose} user={user} />
				)}
			</DialogContent>
		</Dialog>
	);
}
