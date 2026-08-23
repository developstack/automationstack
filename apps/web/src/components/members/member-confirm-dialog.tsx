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

import { MemberFormError } from "@/components/members/member-form-fields";
import type { MemberConfirmKind } from "@/components/members/member-meta";
import type { MemberActions } from "@/components/members/use-member-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ConfirmCopy {
	/** 同时用作标题里的动词与确认按钮文案，两处对不上时用户会犹豫。 */
	action: string;
	description: string;
	destructive: boolean;
}

const CONFIRM_COPY: Record<MemberConfirmKind, ConfirmCopy> = {
	demote: {
		action: "设为成员",
		description: "该账号将失去成员管理入口，项目与用例照常读写。",
		destructive: false,
	},
	disable: {
		action: "停用",
		description: "停用后该账号无法登录；用例上留下的署名会原样保留。",
		destructive: true,
	},
	promote: {
		action: "设为管理员",
		description: "管理员可以创建、停用成员，并重置任何人的密码。",
		destructive: false,
	},
	restore: {
		action: "恢复",
		description: "恢复后该账号可以重新登录，密码保持不变。",
		destructive: false,
	},
};

interface MemberConfirmDialogProps {
	actions: MemberActions;
	member: PublicUser;
}

/** 行内菜单动作的二次确认；服务端拒绝时错误就显示在框里，框不关闭。 */
export function MemberConfirmDialog({
	actions,
	member,
}: MemberConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(actions.closeConfirm);
	const copy = actions.kind === null ? null : CONFIRM_COPY[actions.kind];

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={copy !== null}>
			{copy === null ? null : (
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{copy.action}「{member.username}」？
						</AlertDialogTitle>
						<AlertDialogDescription>{copy.description}</AlertDialogDescription>
					</AlertDialogHeader>
					<MemberFormError message={actions.error} />
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
