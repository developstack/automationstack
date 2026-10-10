import type { PublicUser, UserRole } from "@automationstack/db/schema/users";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";

import { PlatformUserFormError } from "@/components/platform-users/platform-user-form-error";
import {
	PLATFORM_ROLE_LABEL,
	type PlatformUserConfirm,
} from "@/components/platform-users/platform-user-meta";
import type { PlatformUserActions } from "@/components/platform-users/use-platform-user-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ConfirmCopy {
	action: string;
	description: string;
	destructive: boolean;
}

const ACCOUNT_COPY: Record<"disable" | "restore", ConfirmCopy> = {
	disable: {
		action: "停用",
		description:
			"停用后该账号无法登录；项目归属与用例上留下的署名都会原样保留。",
		destructive: true,
	},
	restore: {
		action: "恢复",
		description: "恢复后该账号可以重新登录，密码与项目归属保持不变。",
		destructive: false,
	},
};

/** 改成每个平台角色后，该账号可以做什么。 */
const ROLE_DESCRIPTION: Record<UserRole, string> = {
	admin:
		"平台管理员可以看到和管理所有项目，并管理平台用户和设置：创建、停用账号，重置任何人的密码，调整项目归属。",
	member:
		"普通用户不能新建项目，也不能管理平台用户和设置；已加入的项目与用例照常读写。",
	project_admin:
		"项目管理员可以新建项目，但不能管理平台用户和设置；已加入的项目与用例照常读写。",
};

function confirmCopy(confirm: PlatformUserConfirm): ConfirmCopy {
	if (confirm.kind === "set-role") {
		return {
			action: `设为${PLATFORM_ROLE_LABEL[confirm.role]}`,
			description: ROLE_DESCRIPTION[confirm.role],
			destructive: false,
		};
	}
	return ACCOUNT_COPY[confirm.kind];
}

interface PlatformUserConfirmDialogProps {
	actions: PlatformUserActions;
	user: PublicUser;
}

export function PlatformUserConfirmDialog({
	actions,
	user,
}: PlatformUserConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(actions.closeConfirm);
	const copy = actions.pending === null ? null : confirmCopy(actions.pending);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={copy !== null}>
			{copy === null ? null : (
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{copy.action}「{user.username}」？
						</AlertDialogTitle>
						<AlertDialogDescription>{copy.description}</AlertDialogDescription>
					</AlertDialogHeader>
					<PlatformUserFormError message={actions.error} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actions.isPending}>
							取消
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={actions.isPending}
							onClick={actions.confirm}
							variant={copy.destructive ? "destructive" : "default"}
						>
							{copy.action}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			)}
		</AlertDialog>
	);
}
