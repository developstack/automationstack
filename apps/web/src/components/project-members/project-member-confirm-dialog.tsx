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

import { ProjectMemberFormError } from "@/components/project-members/project-member-form-error";
import type { ProjectMemberConfirmKind } from "@/components/project-members/project-member-meta";
import type { ProjectMemberActions } from "@/components/project-members/use-project-member-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ConfirmCopy {
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
					<ProjectMemberFormError message={actions.error} />
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
