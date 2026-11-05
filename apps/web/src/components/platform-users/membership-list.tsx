import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { XIcon } from "lucide-react";
import { useCallback } from "react";

import type { useUserProjectActions } from "@/components/platform-users/use-user-project-actions";
import { projectRoleOptionsFor } from "@/components/project-members/project-member-meta";

interface MembershipRoleSelectProps {
	disabled: boolean;
	membership: UserProjectMembership;
	onSetRole: (projectId: string, role: ProjectRole) => void;
	platformRole: UserRole;
}

interface MembershipRowProps extends MembershipRoleSelectProps {
	onRemove: (projectId: string) => void;
}

function MembershipRoleSelect({
	disabled,
	membership,
	onSetRole,
	platformRole,
}: MembershipRoleSelectProps) {
	const options = projectRoleOptionsFor(platformRole, membership.role);
	const handleRoleChange = useCallback(
		(next: string | null) => {
			if (next === "member" || next === "owner") {
				onSetRole(membership.id, next);
			}
		},
		[membership.id, onSetRole]
	);

	return (
		<Select
			items={options}
			onValueChange={handleRoleChange}
			value={membership.role}
		>
			<SelectTrigger
				aria-label={`「${membership.name}」里的项目角色`}
				className="w-32 shrink-0"
				disabled={disabled}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function MembershipRow({
	disabled,
	membership,
	onRemove,
	onSetRole,
	platformRole,
}: MembershipRowProps) {
	const handleRemove = useCallback(
		() => onRemove(membership.id),
		[membership.id, onRemove]
	);

	return (
		<li className="flex items-center gap-2">
			<span className="wrap-break-word min-w-0 flex-1 text-sm">
				{membership.name}
			</span>
			<MembershipRoleSelect
				disabled={disabled}
				membership={membership}
				onSetRole={onSetRole}
				platformRole={platformRole}
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
	/** 这个用户的平台角色。普通用户不能设为项目拥有者。 */
	platformRole: UserRole;
}

export function MembershipList({
	actions,
	memberships,
	platformRole,
}: MembershipListProps) {
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
					platformRole={platformRole}
				/>
			))}
		</ul>
	);
}
