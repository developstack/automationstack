import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { PublicUser } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { ManageUserProjectsDialog } from "@/components/platform-users/manage-user-projects-dialog";
import { PlatformUserConfirmDialog } from "@/components/platform-users/platform-user-confirm-dialog";
import { ResetPasswordDialog } from "@/components/platform-users/reset-password-dialog";
import { usePlatformUserActions } from "@/components/platform-users/use-platform-user-actions";

interface PlatformUserActionsMenuProps {
	onDemote: () => void;
	onDisable: () => void;
	onManageProjects: () => void;
	onPromote: () => void;
	onReset: () => void;
	onRestore: () => void;
	user: PublicUser;
}

function PlatformUserActionsMenu({
	onDemote,
	onDisable,
	onManageProjects,
	onPromote,
	onReset,
	onRestore,
	user,
}: PlatformUserActionsMenuProps) {
	return (
		<DropdownMenu>
			{/* 带上用户名：读屏的按钮列表里，一排「用户操作」互相分辨不出来 */}
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={`用户「${user.username}」操作`}
						size="icon-xs"
						variant="ghost"
					>
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={onReset}>重置密码</DropdownMenuItem>
				<DropdownMenuItem onClick={onManageProjects}>
					管理项目归属
				</DropdownMenuItem>
				{user.role === "admin" ? (
					<DropdownMenuItem onClick={onDemote}>设为成员</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onPromote}>设为管理员</DropdownMenuItem>
				)}
				{user.disabledAt === null ? (
					<DropdownMenuItem onClick={onDisable} variant="destructive">
						停用
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onRestore}>恢复</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface PlatformUserRowActionsProps {
	/** 「管理项目归属」那张框要用；账号本身的四个动作用不上。 */
	projects: readonly UserProjectMembership[];
	user: PublicUser;
}

/**
 * 用户表格行尾的操作入口：菜单 + 它触发的三个对话框。
 *
 * `user` 与 `projects` 分开收，而不是收整行 `UserWithProjects`：账号那四个动作
 * （重置密码、改平台角色、停用、恢复）只认 `PublicUser`，把项目也塞进去会让
 * use-platform-user-actions 的入参凭空多出一半用不上的东西。
 */
export function PlatformUserRowActions({
	projects,
	user,
}: PlatformUserRowActionsProps) {
	const actions = usePlatformUserActions(user);
	const { open } = actions;
	const [resetting, setResetting] = useState(false);
	const [managing, setManaging] = useState(false);
	const openReset = useCallback(() => setResetting(true), []);
	const closeReset = useCallback(() => setResetting(false), []);
	const openManage = useCallback(() => setManaging(true), []);
	const closeManage = useCallback(() => setManaging(false), []);
	const askDemote = useCallback(() => open("demote"), [open]);
	const askDisable = useCallback(() => open("disable"), [open]);
	const askPromote = useCallback(() => open("promote"), [open]);
	const askRestore = useCallback(() => open("restore"), [open]);

	return (
		<>
			<PlatformUserActionsMenu
				onDemote={askDemote}
				onDisable={askDisable}
				onManageProjects={openManage}
				onPromote={askPromote}
				onReset={openReset}
				onRestore={askRestore}
				user={user}
			/>
			<PlatformUserConfirmDialog actions={actions} user={user} />
			<ResetPasswordDialog
				onClose={closeReset}
				user={resetting ? user : null}
			/>
			<ManageUserProjectsDialog
				memberships={projects}
				onClose={closeManage}
				user={managing ? user : null}
			/>
		</>
	);
}
