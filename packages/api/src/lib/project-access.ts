import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";

export interface ProjectAccess {
	platformRole: UserRole;
	projectRole: ProjectRole | null;
}

function isPlatformAdmin(access: ProjectAccess): boolean {
	return access.platformRole === "admin";
}

export function canEnterProject(access: ProjectAccess): boolean {
	return isPlatformAdmin(access) || access.projectRole !== null;
}

export function canAdministerProject(access: ProjectAccess): boolean {
	return isPlatformAdmin(access) || access.projectRole === "owner";
}

export function seesAllProjects(platformRole: UserRole): boolean {
	return platformRole === "admin";
}

/** 平台管理员和项目管理员可以新建项目，普通用户不可以。服务端和 web 共用这条规则。 */
export function canCreateProject(platformRole: UserRole): boolean {
	return platformRole === "admin" || platformRole === "project_admin";
}
