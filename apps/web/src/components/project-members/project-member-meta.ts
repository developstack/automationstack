import { canAdministerProject } from "@automationstack/api/lib/project-access";
import type { UserRole } from "@automationstack/db/schema/users";

import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";

/** 项目内没有角色。不是管理员的项目成员显示为「成员」。 */
export const PROJECT_MEMBER_LABEL = "成员";

export interface SessionIdentity {
	id: string;
	role: UserRole;
}

export interface ProjectMemberIdentity {
	platformRole: UserRole;
	userId: string;
}

/** 只有管理员能管理项目成员。与服务端共用 canAdministerProject，服务端也检查。 */
export function canManageProjectMembers(
	session: SessionIdentity | null
): boolean {
	return (
		session !== null && canAdministerProject({ platformRole: session.role })
	);
}

/** 成员列表中的角色：管理员显示「管理员」，其他人显示「成员」。 */
export function projectMemberLabelFor(member: {
	platformRole: UserRole;
}): string {
	return member.platformRole === "admin"
		? PLATFORM_ROLE_LABEL.admin
		: PROJECT_MEMBER_LABEL;
}

/**
 * 当前用户在项目中的角色名称。管理员不加入项目也能进入，所以总是显示「管理员」。
 * 其他不在成员列表里的用户没有角色名称。
 */
export function viewerProjectRoleLabel(
	session: SessionIdentity,
	members: readonly ProjectMemberIdentity[]
): string | null {
	if (session.role === "admin") {
		return PLATFORM_ROLE_LABEL.admin;
	}
	return members.some((member) => member.userId === session.id)
		? PROJECT_MEMBER_LABEL
		: null;
}
