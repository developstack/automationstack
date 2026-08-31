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
	PlatformUserField,
	PlatformUserFormError,
} from "@/components/platform-users/platform-user-form-fields";
import {
	isUserRole,
	PASSWORD_HINT,
	PLATFORM_ROLE_OPTIONS,
	USERNAME_HINT,
	validatePassword,
	validateUsername,
} from "@/components/platform-users/platform-user-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

const ROLE_FIELD_ID = "platform-user-role";

function useCreateUser(onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.users.create.mutationOptions({
			// 用户名重复是这个表单最常见的失败，错误要留在对话框里挨着输入框说
			meta: { suppressErrorToast: true },
			onSuccess: (user) => {
				queryClient.invalidateQueries({
					queryKey: orpc.users.listWithProjects.key(),
				});
				toast.success(`用户「${user.username}」已创建`);
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
			<Label htmlFor={ROLE_FIELD_ID}>平台角色</Label>
			<Select
				items={PLATFORM_ROLE_OPTIONS}
				onValueChange={handleValueChange}
				value={value}
			>
				<SelectTrigger className="w-full" id={ROLE_FIELD_ID}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{PLATFORM_ROLE_OPTIONS.map((option) => (
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
function useCreateUserForm(onClose: () => void) {
	const create = useCreateUser(onClose);
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

function CreatePlatformUserForm({ onClose }: { onClose: () => void }) {
	const form = useCreateUserForm(onClose);

	return (
		// noValidate：原生气泡是英文的，也没法和这里的中文内联提示对齐
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<PlatformUserField
				autoComplete="off"
				error={form.usernameError}
				hint={USERNAME_HINT}
				id="platform-user-username"
				label="用户名"
				onChange={form.setUsername}
				value={form.username}
			/>
			<PlatformUserField
				autoComplete="new-password"
				error={form.passwordError}
				hint={PASSWORD_HINT}
				id="platform-user-password"
				label="初始密码"
				onChange={form.setPassword}
				type="password"
				value={form.password}
			/>
			<RoleField onChange={form.setRole} value={form.role} />
			<PlatformUserFormError message={form.error} />
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

interface CreatePlatformUserDialogProps {
	onClose: () => void;
	open: boolean;
}

/**
 * 新建平台用户：用户名 + 初始密码 + 平台角色。
 *
 * 这里不选项目：账号先存在，再谈他进哪些项目——后者是行内的「管理项目归属」，
 * 两件事分开做，新建这一步才不必先把项目列表也读进来。
 */
export function CreatePlatformUserDialog({
	onClose,
	open,
}: CreatePlatformUserDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>新建用户</DialogTitle>
					<DialogDescription>
						账号由管理员创建；初始密码请另行告知本人。
					</DialogDescription>
				</DialogHeader>
				{/* 只在打开时挂载：关闭后重新打开是一张干净的表，不留上次的输入和错误 */}
				{open ? <CreatePlatformUserForm onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
