import type { UserRole } from "@automationstack/db/schema/users";

/** 用户有哪些已启用的 Casdoor 角色。 */
export interface PlatformRoleGrants {
	isAdmin: boolean;
	isProjectAdmin: boolean;
}

/**
 * 平台角色的优先级（D4、#15）：平台管理员 → 项目管理员 → 普通用户。
 * 登录（claims.ts）和对账（reconcile-plan.ts）共用这条规则。
 */
export function platformRoleFor({
	isAdmin,
	isProjectAdmin,
}: PlatformRoleGrants): UserRole {
	if (isAdmin) {
		return "admin";
	}
	if (isProjectAdmin) {
		return "project_admin";
	}
	return "member";
}
