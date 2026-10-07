import type { PublicUser } from "@automationstack/db/schema/users";
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
import type { PlatformUserConfirmKind } from "@/components/platform-users/platform-user-meta";
import type { PlatformUserActions } from "@/components/platform-users/use-platform-user-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ConfirmCopy {
	action: string;
	description: string;
	destructive: boolean;
}

const CONFIRM_COPY: Record<PlatformUserConfirmKind, ConfirmCopy> = {
	demote: {
		action: "设为成员",
		description: "该账号将失去平台用户管理入口；已加入的项目与用例照常读写。",
		destructive: false,
	},
	disable: {
		action: "停用",
		description:
			"停用后该账号无法登录；项目归属与用例上留下的署名都会原样保留。",
		destructive: true,
	},
	promote: {
		action: "设为管理员",
		description: "管理员可以创建、停用账号，重置任何人的密码，并调整项目归属。",
		destructive: false,
	},
	restore: {
		action: "恢复",
		description: "恢复后该账号可以重新登录，密码与项目归属保持不变。",
		destructive: false,
	},
};

interface PlatformUserConfirmDialogProps {
	actions: PlatformUserActions;
	user: PublicUser;
}

export function PlatformUserConfirmDialog({
	actions,
	user,
}: PlatformUserConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(actions.closeConfirm);
	const copy = actions.kind === null ? null : CONFIRM_COPY[actions.kind];

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
