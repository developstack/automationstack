import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { PublicUser } from "@automationstack/db/schema/users";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { MembershipList } from "@/components/platform-users/membership-list";
import { PlatformUserFormError } from "@/components/platform-users/platform-user-form-error";
import { useUserProjectActions } from "@/components/platform-users/use-user-project-actions";
import { UserProjectAddForm } from "@/components/platform-users/user-project-add-form";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ManageUserProjectsDialogProps {
	/** 这个人当前的项目归属，顺序由服务端给（项目名升序），前端不再排一次。 */
	memberships: readonly UserProjectMembership[];
	onClose: () => void;
	/** null 表示对话框关闭。 */
	user: PublicUser | null;
}

/** 对话框主体；单独一层是为了只在打开时挂载，关掉再开是一张干净的表。 */
function ManageUserProjectsBody({
	memberships,
	user,
}: {
	memberships: readonly UserProjectMembership[];
	user: PublicUser;
}) {
	const actions = useUserProjectActions(user.id);
	const memberOf = new Set(memberships.map((membership) => membership.id));

	return (
		<div className="flex flex-col gap-4">
			<MembershipList actions={actions} memberships={memberships} />
			{/*
			 * 服务端拒绝时把那句话原样摆出来（最典型的是「不能移除项目的最后一个
			 * owner」）。不吞、也不改写成自己的措辞：拒绝的判据在服务端，改写迟早
			 * 会与它对不上，而这一句正是用户唯一能据以下一步动作的信息。
			 */}
			<PlatformUserFormError message={actions.error} />
			<UserProjectAddForm
				disabled={actions.isPending}
				memberOf={memberOf}
				onAdd={actions.add}
			/>
		</div>
	);
}

/**
 * 管理某个人的项目归属：看他在哪些项目里、改他在里面的角色、把他移出去或加进来。
 *
 * 每一步都是一次独立的请求，点一下就走，没有「保存」按钮：三条端点本来就是逐个
 * 项目的（护栏也逐个生效，见 use-user-project-actions.ts），攒起来一次提交只会
 * 制造一个「部分成功」的中间态。列表本身跟着表格那条 listWithProjects 走，成功
 * 之后由失效带回来，所以框里不留本地副本。
 */
export function ManageUserProjectsDialog({
	memberships,
	onClose,
	user,
}: ManageUserProjectsDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={user !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>管理项目归属</DialogTitle>
					<DialogDescription>
						「{user?.username}」所属的项目。改动即时生效，没有保存这一步。
					</DialogDescription>
				</DialogHeader>
				{user === null ? null : (
					<ManageUserProjectsBody memberships={memberships} user={user} />
				)}
			</DialogContent>
		</Dialog>
	);
}
