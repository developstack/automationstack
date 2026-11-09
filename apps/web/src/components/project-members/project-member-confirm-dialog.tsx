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
import type { ProjectMemberActions } from "@/components/project-members/use-project-member-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

const REMOVE_DESCRIPTION =
	"移出后该账号不能再进入本项目；他在用例与测试记录上留下的署名会原样保留，需要时随时可以再加回来。";

interface ProjectMemberConfirmDialogProps {
	actions: ProjectMemberActions;
	member: ProjectMemberView;
}

export function ProjectMemberConfirmDialog({
	actions,
	member,
}: ProjectMemberConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(actions.closeConfirm);
	return (
		<AlertDialog onOpenChange={handleOpenChange} open={actions.confirming}>
			{actions.confirming ? (
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>移出项目「{member.username}」？</AlertDialogTitle>
						<AlertDialogDescription>
							{REMOVE_DESCRIPTION}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ProjectMemberFormError message={actions.error} />
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actions.isPending}>
							取消
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={actions.isPending}
							onClick={actions.confirm}
							variant="destructive"
						>
							移出项目
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}
