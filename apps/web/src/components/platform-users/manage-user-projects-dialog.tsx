import { canBecomeProjectOwner } from "@automationstack/api/lib/project-access";
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
import { OWNER_NOT_ELIGIBLE_HINT } from "@/components/project-members/project-member-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ManageUserProjectsDialogProps {
	memberships: readonly UserProjectMembership[];
	onClose: () => void;
	user: PublicUser | null;
}

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
			{canBecomeProjectOwner(user.role) ? null : (
				<p className="text-muted-foreground text-xs">
					{OWNER_NOT_ELIGIBLE_HINT}
				</p>
			)}
			<MembershipList
				actions={actions}
				memberships={memberships}
				platformRole={user.role}
			/>
			<PlatformUserFormError message={actions.error} />
			<UserProjectAddForm
				disabled={actions.isPending}
				memberOf={memberOf}
				onAdd={actions.add}
				platformRole={user.role}
			/>
		</div>
	);
}

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
