import type { UserRole } from "@automationstack/db/schema/users";

/** 用户对一个项目的访问：平台角色，以及是否是这个项目的成员。 */
export interface ProjectAccess {
	isMember: boolean;
	platformRole: UserRole;
}

function isPlatformAdmin(access: Pick<ProjectAccess, "platformRole">): boolean {
	return access.platformRole === "admin";
}

/** 管理员可以进入所有项目。普通用户只能进入自己是成员的项目。 */
export function canEnterProject(access: ProjectAccess): boolean {
	return isPlatformAdmin(access) || access.isMember;
}

/**
 * 只有管理员可以管理项目：修改项目、管理成员、修改项目设置（ADR 0008）。
 * 服务端和 web 共用这条规则。
 */
export function canAdministerProject(
	access: Pick<ProjectAccess, "platformRole">
): boolean {
	return isPlatformAdmin(access);
}

export function seesAllProjects(platformRole: UserRole): boolean {
	return platformRole === "admin";
}

/** 只有管理员可以新建项目。服务端和 web 共用这条规则。 */
export function canCreateProject(platformRole: UserRole): boolean {
	return platformRole === "admin";
}
