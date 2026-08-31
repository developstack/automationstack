import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { PublicUser } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { XIcon } from "lucide-react";
import { useCallback } from "react";

import { PlatformUserFormError } from "@/components/platform-users/platform-user-form-fields";
import { useUserProjectActions } from "@/components/platform-users/use-user-project-actions";
import { UserProjectAddForm } from "@/components/platform-users/user-project-add-form";
import { PROJECT_ROLE_OPTIONS } from "@/components/project-members/project-member-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface MembershipRowProps {
	disabled: boolean;
	membership: UserProjectMembership;
	onRemove: (projectId: string) => void;
	onSetRole: (projectId: string, role: ProjectRole) => void;
}

interface MembershipRoleSelectProps {
	disabled: boolean;
	membership: UserProjectMembership;
	onSetRole: (projectId: string, role: ProjectRole) => void;
}

/**
 * 一行里的项目角色下拉。
 *
 * 单拆一层，是因为 Base UI 的 Select 要连带写出 4 个子组件；和「项目名 + 移出
 * 按钮」挤在同一个函数里，光是它的骨架就盖过了这一行本身那点逻辑。
 */
function MembershipRoleSelect({
	disabled,
	membership,
	onSetRole,
}: MembershipRoleSelectProps) {
	const handleRoleChange = useCallback(
		(next: string | null) => {
			// Base UI 在清空时给的是 null，这里只认两个合法值，其余一律不发请求
			if (next === "member" || next === "owner") {
				onSetRole(membership.id, next);
			}
		},
		[membership.id, onSetRole]
	);

	return (
		<Select
			items={PROJECT_ROLE_OPTIONS}
			onValueChange={handleRoleChange}
			value={membership.role}
		>
			{/* 一行一个下拉，可访问名必须带上项目名才分辨得出是哪一个 */}
			<SelectTrigger
				aria-label={`「${membership.name}」里的项目角色`}
				className="w-32 shrink-0"
				disabled={disabled}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PROJECT_ROLE_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** 已归属的一行：项目名 + 项目角色下拉 + 移出按钮。 */
function MembershipRow({
	disabled,
	membership,
	onRemove,
	onSetRole,
}: MembershipRowProps) {
	const handleRemove = useCallback(
		() => onRemove(membership.id),
		[membership.id, onRemove]
	);

	return (
		<li className="flex items-center gap-2">
			{/* min-w-0 + break-words：项目名可以很长，也可能是一串没有断点的长词 */}
			<span className="wrap-break-word min-w-0 flex-1 text-sm">
				{membership.name}
			</span>
			<MembershipRoleSelect
				disabled={disabled}
				membership={membership}
				onSetRole={onSetRole}
			/>
			<Button
				aria-label={`把他移出「${membership.name}」`}
				disabled={disabled}
				onClick={handleRemove}
				size="icon-xs"
				variant="ghost"
			>
				<XIcon />
			</Button>
		</li>
	);
}

interface MembershipListProps {
	actions: ReturnType<typeof useUserProjectActions>;
	memberships: readonly UserProjectMembership[];
}

function MembershipList({ actions, memberships }: MembershipListProps) {
	if (memberships.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				他还不属于任何项目。用下面那张表把他加进第一个。
			</p>
		);
	}
	return (
		<ul className="flex flex-col gap-2">
			{memberships.map((membership) => (
				<MembershipRow
					disabled={actions.isPending}
					key={membership.id}
					membership={membership}
					onRemove={actions.remove}
					onSetRole={actions.setRole}
				/>
			))}
		</ul>
	);
}

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
