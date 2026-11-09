import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";
import { Button } from "@automationstack/ui/components/button";
import { XIcon } from "lucide-react";
import { useCallback } from "react";

import type { useUserProjectActions } from "@/components/platform-users/use-user-project-actions";

interface MembershipRowProps {
	disabled: boolean;
	membership: UserProjectMembership;
	onRemove: (projectId: string) => void;
}

function MembershipRow({ disabled, membership, onRemove }: MembershipRowProps) {
	const handleRemove = useCallback(
		() => onRemove(membership.id),
		[membership.id, onRemove]
	);

	return (
		<li className="flex items-center gap-2">
			<span className="wrap-break-word min-w-0 flex-1 text-sm">
				{membership.name}
			</span>
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
				/>
			))}
		</ul>
	);
}
