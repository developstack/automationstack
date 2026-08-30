import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
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
import type { ProjectMemberConfirmKind } from "@/components/project-members/project-member-meta";
import type { ProjectMemberActions } from "@/components/project-members/use-project-member-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ConfirmCopy {
	/** 同时用作标题里的动词与确认按钮文案，两处对不上时用户会犹豫。 */
	action: string;
	description: string;
	destructive: boolean;
}

const CONFIRM_COPY: Record<ProjectMemberConfirmKind, ConfirmCopy> = {
	demote: {
		action: "设为成员",
		description:
			"该成员将不能再增删改本项目的成员，也不能改项目名或删除项目；用例与测试任务照常读写。",
		destructive: false,
	},
	promote: {
		action: "设为拥有者",
		description: "拥有者可以增删改本项目的成员，并能改项目名、删除整个项目。",
		destructive: false,
	},
	remove: {
		action: "移出项目",
		description:
			"移出后该账号不能再进入本项目；他在用例与测试记录上留下的署名会原样保留，需要时随时可以再加回来。",
		destructive: true,
	},
};

interface ProjectMemberConfirmDialogProps {
	actions: ProjectMemberActions;
	member: ProjectMemberView;
}

/**
 * 行内菜单动作的二次确认；服务端拒绝时错误就显示在框里，框不关闭。
 *
 * 「不能降级 / 移除项目的最后一个 owner」这条服务端保护正是落在这里：它是
 * BAD_REQUEST，冒到全站兜底的错误 toast 上只会摆一句没有上下文的红字，而人
 * 刚刚点下的按钮已经关掉了。留在框里，那句话就挨着他要做的事。
 *
 * 错误行复用 `components/members/member-form-fields` 的 MemberFormError：那是
 * 一个只画一行红字 + role="alert" 的展示组件，跨作用域复用它不会把平台账号
 * 管理的逻辑牵进来。
 */
export function ProjectMemberConfirmDialog({
	actions,
	member,
}: ProjectMemberConfirmDialogProps) {
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
