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

import {
	MemberField,
	MemberFormError,
} from "@/components/members/member-form-fields";
import {
	PASSWORD_HINT,
	validatePassword,
} from "@/components/members/member-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

interface ResetPasswordFormProps {
	member: PublicUser;
	onClose: () => void;
}

function useResetPassword(member: PublicUser, onClose: () => void) {
	return useMutation(
		orpc.users.resetPassword.mutationOptions({
			// 失败原因（口令不合规、账号已不存在）就写在这张表单里
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				// 只改了口令散列，users.list 的字段一个都没变，不必失效列表
				toast.success(`已重置「${member.username}」的密码`);
				onClose();
			},
		})
	);
}

function ResetPasswordForm({ member, onClose }: ResetPasswordFormProps) {
	const [password, setPassword] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const reset = useResetPassword(member, onClose);
	// 空字段只在提交过一次之后才算错，一进来就标红等于劈头指责
	const passwordError =
		submitted || password !== "" ? validatePassword(password) : null;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (validatePassword(password) !== null) {
				return;
			}
			reset.mutate({ id: member.id, password });
		},
		[member.id, password, reset]
	);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<MemberField
				autoComplete="new-password"
				error={passwordError}
				hint={PASSWORD_HINT}
				id="reset-password"
				label="新密码"
				onChange={setPassword}
				type="password"
				value={password}
			/>
			<MemberFormError message={reset.error?.message} />
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
	/** null 表示对话框关闭。 */
	member: PublicUser | null;
	onClose: () => void;
}

/** 管理员直接给成员设新密码；成员本人不在场，所以不需要旧密码。 */
export function ResetPasswordDialog({
	member,
	onClose,
}: ResetPasswordDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={member !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>重置密码</DialogTitle>
					<DialogDescription>
						{/*
						 * 会话是无状态签名，改密码不会把对方已登录的标签页踢下线，
						 * 这一点得让操作的人知道，否则会以为「改完就锁住了」。
						 */}
						为「{member?.username}」设置新密码；对方已登录的窗口不会被强制退出。
					</DialogDescription>
				</DialogHeader>
				{member === null ? null : (
					<ResetPasswordForm member={member} onClose={onClose} />
				)}
			</DialogContent>
		</Dialog>
	);
}
