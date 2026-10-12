import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { PublicUser, UserRole } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { ManageUserProjectsDialog } from "@/components/platform-users/manage-user-projects-dialog";
import type { PlatformUserActionAccess } from "@/components/platform-users/platform-user-access";
import { PlatformUserConfirmDialog } from "@/components/platform-users/platform-user-confirm-dialog";
import { roleChangeTargets } from "@/components/platform-users/platform-user-meta";
import { PlatformUserRoleChangeItem } from "@/components/platform-users/platform-user-role-change-item";
import { ResetPasswordDialog } from "@/components/platform-users/reset-password-dialog";
import { usePlatformUserActions } from "@/components/platform-users/use-platform-user-actions";

interface PlatformUserActionsMenuProps {
	access: PlatformUserActionAccess;
	onDisable: () => void;
	onManageProjects: () => void;
	onReset: () => void;
	onRestore: () => void;
	onSetRole: (role: UserRole) => void;
	user: PublicUser;
}

type AccountActionItemsProps = Omit<
	PlatformUserActionsMenuProps,
	"onManageProjects"
>;

/** 重置密码、修改平台角色、停用和恢复。Casdoor 管理的用户只显示提示，菜单项不可用。 */
function AccountActionItems({
	access,
	onDisable,
	onReset,
	onRestore,
	onSetRole,
	user,
}: AccountActionItemsProps) {
	const locked = !access.accountActions;
	return (
		<DropdownMenuGroup>
			{access.hint === null ? null : (
				<DropdownMenuLabel>{access.hint}</DropdownMenuLabel>
			)}
			<DropdownMenuItem disabled={locked} onClick={onReset}>
				重置密码
			</DropdownMenuItem>
			{roleChangeTargets(user.role).map((role) => (
				<PlatformUserRoleChangeItem
					disabled={locked}
					key={role}
					onSetRole={onSetRole}
					role={role}
				/>
			))}
			{user.disabledAt === null ? (
				<DropdownMenuItem
					disabled={locked}
					onClick={onDisable}
					variant="destructive"
				>
					停用
				</DropdownMenuItem>
			) : (
				<DropdownMenuItem disabled={locked} onClick={onRestore}>
					恢复
				</DropdownMenuItem>
			)}
		</DropdownMenuGroup>
	);
}

function PlatformUserActionsMenu({
	onManageProjects,
	...items
}: PlatformUserActionsMenuProps) {
	const { user } = items;
	return (
		<DropdownMenu>
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
				<DropdownMenuItem onClick={onManageProjects}>
					管理项目归属
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<AccountActionItems {...items} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface PlatformUserRowActionsProps {
	access: PlatformUserActionAccess;
	projects: readonly UserProjectMembership[];
	user: PublicUser;
}

export function PlatformUserRowActions({
	access,
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
	const askDisable = useCallback(() => open({ kind: "disable" }), [open]);
	const askRestore = useCallback(() => open({ kind: "restore" }), [open]);
	const askSetRole = useCallback(
		(role: UserRole) => open({ kind: "set-role", role }),
		[open]
	);

	return (
		<>
			<PlatformUserActionsMenu
				access={access}
				onDisable={askDisable}
				onManageProjects={openManage}
				onReset={openReset}
				onRestore={askRestore}
				onSetRole={askSetRole}
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
