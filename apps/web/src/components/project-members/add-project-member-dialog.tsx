import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";

import { AddProjectMemberForm } from "@/components/project-members/add-project-member-form";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface AddProjectMemberDialogProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

/**
 * 添加成员：从平台账号里挑一个人，定他在本项目里的角色。
 *
 * 候选人走 `projectMembers.listCandidates` 而不是 `users.list`——后者是
 * `adminProcedure`，项目 owner 调不动（完整理由见那条过程与它背后查询的注释）。
 * 这里不提供「新建平台账号」的入口：账号由平台管理员统一创建（设置页的
 * 「平台账号」那格），项目 owner 只是从已有的人里挑，两件事的作用域不同。
 */
export function AddProjectMemberDialog({
	onClose,
	open,
	projectId,
}: AddProjectMemberDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>添加成员</DialogTitle>
					<DialogDescription>
						把一个已有的平台账号加进本项目；他登录后就能看到这个项目。
					</DialogDescription>
				</DialogHeader>
				{/* 只在打开时挂载：关闭后重新打开是一张干净的表，不留上次的选择与错误 */}
				{open ? (
					<AddProjectMemberForm onClose={onClose} projectId={projectId} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
