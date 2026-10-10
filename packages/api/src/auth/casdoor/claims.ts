import type { UserRole } from "@automationstack/db/schema/users";

/** ID token 中的角色对象（Token 格式 JWT，plan 021 §11.1）。 */
interface CasdoorRoleClaim {
	isEnabled?: unknown;
	name?: unknown;
	owner?: unknown;
}

/** 计算平台角色需要的配置：组织和两个角色名。 */
export interface RoleMappingOptions {
	adminRole: string;
	organization: string;
	projectAdminRole: string;
}

/** roles 中有没有一个角色的 owner 等于组织、name 等于角色名、isEnabled === true。 */
function hasEnabledRole(
	roles: readonly unknown[],
	name: string,
	organization: string
): boolean {
	return roles.some((role: unknown) => {
		if (typeof role !== "object" || role === null) {
			return false;
		}
		const claim = role as CasdoorRoleClaim;
		return (
			claim.owner === organization &&
			claim.name === name &&
			claim.isEnabled === true
		);
	});
}

/**
 * 平台角色（D4、§11.10 第 5 项、#15）。只计算 owner 等于组织、isEnabled === true 的角色。
 * 按顺序取第一个满足的结果：平台管理员角色 → admin；项目管理员角色 → project_admin；
 * 其他 → member。roles 缺失、不是数组或为空时为 member。同步总是覆盖，不只增加。
 */
export function platformRoleFromRoles(
	roles: unknown,
	options: RoleMappingOptions
): UserRole {
	if (!Array.isArray(roles)) {
		return "member";
	}
	if (hasEnabledRole(roles, options.adminRole, options.organization)) {
		return "admin";
	}
	if (hasEnabledRole(roles, options.projectAdminRole, options.organization)) {
		return "project_admin";
	}
	return "member";
}

export interface CasdoorIdentity {
	/** Casdoor 用户 id（UUID），保存为 users.external_id。 */
	externalId: string;
	role: UserRole;
	username: string;
}

export type IdentityRejection =
	| "forbidden"
	| "missing-sub"
	| "missing-username"
	| "wrong-organization";

export type IdentityResult =
	| { identity: CasdoorIdentity; kind: "ok" }
	| { kind: "rejected"; reason: IdentityRejection };

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * ID token 的字段映射（plan 021 §11.9 T10）。iss、aud、nonce 和签名由 openid-client 校验。
 * sub 为空、owner 不是配置的组织、isForbidden 或 isDeleted 为 true 时拒绝登录。
 */
export function identityFromClaims(
	claims: Record<string, unknown>,
	options: RoleMappingOptions
): IdentityResult {
	const externalId = text(claims.sub);
	if (externalId === "") {
		return { kind: "rejected", reason: "missing-sub" };
	}
	if (claims.owner !== options.organization) {
		return { kind: "rejected", reason: "wrong-organization" };
	}
	if (claims.isForbidden === true || claims.isDeleted === true) {
		return { kind: "rejected", reason: "forbidden" };
	}
	const username = text(claims.name);
	if (username === "") {
		return { kind: "rejected", reason: "missing-username" };
	}
	return {
		identity: {
			externalId,
			role: platformRoleFromRoles(claims.roles, options),
			username,
		},
		kind: "ok",
	};
}
