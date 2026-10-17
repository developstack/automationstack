import type { UserRole } from "@automationstack/db/schema/users";
import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";
import { useCallback } from "react";

import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";

interface PlatformUserRoleChangeItemProps {
	onSetRole: (role: UserRole) => void;
	role: UserRole;
}

/** 用户菜单中的「设为某个平台角色」。 */
export function PlatformUserRoleChangeItem({
	onSetRole,
	role,
}: PlatformUserRoleChangeItemProps) {
	const handleClick = useCallback(() => onSetRole(role), [onSetRole, role]);
	return (
		<DropdownMenuItem onClick={handleClick}>
			设为{PLATFORM_ROLE_LABEL[role]}
		</DropdownMenuItem>
	);
}
