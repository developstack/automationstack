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

/**
 * 平台管理员可以管理所有项目。其他用户必须是项目 owner，并且平台角色是项目管理员。
 * 每次请求都重新计算：项目管理员降级为普通用户后，项目 owner 记录保留，管理权限暂停；恢复角色后自动恢复。
 */
export function canAdministerProject(access: ProjectAccess): boolean {
	if (isPlatformAdmin(access)) {
		return true;
	}
	return (
		access.projectRole === "owner" && canBecomeProjectOwner(access.platformRole)
	);
}

/** 平台管理员和项目管理员可以成为项目 owner，普通用户不可以。服务端和 web 共用这条规则。 */
export function canBecomeProjectOwner(platformRole: UserRole): boolean {
	return platformRole === "admin" || platformRole === "project_admin";
}

export function seesAllProjects(platformRole: UserRole): boolean {
	return platformRole === "admin";
}

/** 平台管理员和项目管理员可以新建项目，普通用户不可以。服务端和 web 共用这条规则。 */
export function canCreateProject(platformRole: UserRole): boolean {
	return platformRole === "admin" || platformRole === "project_admin";
}
