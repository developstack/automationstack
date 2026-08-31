/**
 * 「管理项目归属」框里那份已归属列表（含空态）。原是
 * manage-user-projects-dialog.tsx 里的私有辅助，按「同文件最多 2 个私有辅助
 * 组件」拆出来；单行与行内的角色下拉只服务于这份列表，跟着一起搬。
 */
import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
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
import { PROJECT_ROLE_OPTIONS } from "@/components/project-members/project-member-meta";

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

export function MembershipList({ actions, memberships }: MembershipListProps) {
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
