import type { UserRole } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	MemberField,
	MemberFormError,
} from "@/components/members/member-form-fields";
import {
	isUserRole,
	PASSWORD_HINT,
	ROLE_OPTIONS,
	USERNAME_HINT,
	validatePassword,
	validateUsername,
} from "@/components/members/member-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

const ROLE_FIELD_ID = "member-role";

function useCreateMember(onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.users.create.mutationOptions({
			// 用户名重复是这个表单最常见的失败，错误要留在对话框里挨着输入框说
			meta: { suppressErrorToast: true },
			onSuccess: (user) => {
				queryClient.invalidateQueries({ queryKey: orpc.users.list.key() });
				toast.success(`成员「${user.username}」已创建`);
				onClose();
			},
		})
	);
}

interface RoleFieldProps {
	onChange: (role: UserRole) => void;
	value: UserRole;
}

function RoleField({ onChange, value }: RoleFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => {
			// Base UI 的清空动作会给 null，此时保持原值而不是掉进未定义角色
			if (isUserRole(next)) {
				onChange(next);
			}
		},
		[onChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={ROLE_FIELD_ID}>角色</Label>
			<Select
				items={ROLE_OPTIONS}
				onValueChange={handleValueChange}
				value={value}
			>
				<SelectTrigger className="w-full" id={ROLE_FIELD_ID}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{ROLE_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * 表单状态与校验。
 * `submitted` 决定「还没动过的空字段」要不要报错：一进对话框就把两个字段
 * 标红等于劈头指责，所以空值只在提交过一次之后才算错。
 */
function useCreateMemberForm(onClose: () => void) {
	const create = useCreateMember(onClose);
	const [password, setPassword] = useState("");
	const [role, setRole] = useState<UserRole>("member");
	const [submitted, setSubmitted] = useState(false);
	const [username, setUsername] = useState("");

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (
				validateUsername(username) !== null ||
				validatePassword(password) !== null
			) {
				return;
			}
			create.mutate({ password, role, username: username.trim() });
		},
		[create, password, role, username]
	);

	return {
		error: create.error?.message,
		handleSubmit,
		password,
		passwordError:
			submitted || password !== "" ? validatePassword(password) : null,
		pending: create.isPending,
		role,
		setPassword,
		setRole,
		setUsername,
		username,
		usernameError:
			submitted || username !== "" ? validateUsername(username) : null,
	};
}

function CreateMemberForm({ onClose }: { onClose: () => void }) {
	const form = useCreateMemberForm(onClose);

	return (
		// noValidate：原生气泡是英文的，也没法和这里的中文内联提示对齐
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<MemberField
				autoComplete="off"
				error={form.usernameError}
				hint={USERNAME_HINT}
				id="member-username"
				label="用户名"
				onChange={form.setUsername}
				value={form.username}
			/>
			<MemberField
				autoComplete="new-password"
				error={form.passwordError}
				hint={PASSWORD_HINT}
				id="member-password"
				label="初始密码"
				onChange={form.setPassword}
				type="password"
				value={form.password}
			/>
			<RoleField onChange={form.setRole} value={form.role} />
			<MemberFormError message={form.error} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "创建中…" : "创建"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface CreateMemberDialogProps {
	onClose: () => void;
	open: boolean;
}

/** 新建成员：用户名 + 初始密码 + 角色。 */
export function CreateMemberDialog({ onClose, open }: CreateMemberDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>新建成员</DialogTitle>
					<DialogDescription>
						账号由管理员创建；初始密码请另行告知本人。
					</DialogDescription>
				</DialogHeader>
				{/* 只在打开时挂载：关闭后重新打开是一张干净的表，不留上次的输入和错误 */}
				{open ? <CreateMemberForm onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
