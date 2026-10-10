import type { CasdoorShadowUser } from "@automationstack/db/repositories/casdoor-users-repository";
import type { UserRole } from "@automationstack/db/schema/users";

import type {
	CasdoorRoleRecord,
	CasdoorUserRecord,
} from "./management-records";

const WILDCARD = "*";

export interface ReconcileInput {
	/** null 表示平台管理员角色不存在：不修改任何角色（§11.9 T11a）。 */
	adminRole: CasdoorRoleRecord | null;
	casdoorUsers: readonly CasdoorUserRecord[];
	localUsers: readonly CasdoorShadowUser[];
	now: Date;
	organization: string;
	/** null 表示项目管理员角色不存在：不修改任何角色（#15）。 */
	projectAdminRole: CasdoorRoleRecord | null;
}

export interface ReconcileChange {
	changes: { disabledAt?: Date | null; role?: UserRole };
	id: string;
	username: string;
}

export interface ReconcilePlan {
	changes: ReconcileChange[];
	warnings: string[];
}

interface RoleMemberIds {
	ids: Set<string>;
	warnings: string[];
}

/** 两个角色的成员。任何一个角色不存在时为 null：不修改任何角色。 */
interface PlatformRoleMembers {
	admins: RoleMemberIds;
	projectAdmins: RoleMemberIds;
}

function splitMember(member: string): { name: string; owner: string } | null {
	const index = member.indexOf("/");
	if (index <= 0) {
		return null;
	}
	return { name: member.slice(index + 1), owner: member.slice(0, index) };
}

/**
 * 把角色成员（「组织/用户名」）转换为 Casdoor 用户 id（T11）。
 * 其他组织的成员、通配符和找不到的用户一律丢弃，并写 WARN：只少授权，不多授权。
 * 只按 Casdoor 用户列表转换，不使用本地的 username 列。
 */
export function memberIdsFromRole(
	role: CasdoorRoleRecord,
	users: readonly CasdoorUserRecord[],
	organization: string
): RoleMemberIds {
	const result: RoleMemberIds = { ids: new Set(), warnings: [] };
	if (!role.isEnabled) {
		// 角色被关闭时，视为没有成员（§11.9、#15）。
		return result;
	}
	const idByName = new Map(
		users
			.filter((user) => user.owner === organization && user.id !== "")
			.map((user) => [user.name, user.id] as const)
	);
	for (const member of role.users) {
		const parsed = splitMember(member);
		let id: string | undefined;
		if (parsed === null || parsed.owner !== organization) {
			result.warnings.push(
				`丢弃角色「${role.name}」中其他组织的成员「${member}」。`
			);
		} else if (parsed.name.includes(WILDCARD)) {
			result.warnings.push(
				`丢弃角色「${role.name}」中的通配符成员「${member}」。`
			);
		} else {
			id = idByName.get(parsed.name);
			if (id === undefined) {
				result.warnings.push(
					`角色「${role.name}」的成员「${member}」不在用户列表中，丢弃。`
				);
			}
		}
		if (id !== undefined) {
			result.ids.add(id);
		}
	}
	return result;
}

function disabledChange(
	local: CasdoorShadowUser,
	remote: CasdoorUserRecord | undefined,
	now: Date
): Date | null | undefined {
	const active =
		remote !== undefined && !remote.isForbidden && !remote.isDeleted;
	if (!active && local.disabledAt === null) {
		return now;
	}
	if (active && local.disabledAt !== null) {
		return null;
	}
	return undefined;
}

/**
 * 读取两个角色的成员。任何一个角色不存在时返回 null（T11a、#15）：
 * 配置错误不能造成大规模降级。
 */
function platformRoleMembers(
	input: ReconcileInput
): PlatformRoleMembers | null {
	if (input.adminRole === null || input.projectAdminRole === null) {
		return null;
	}
	return {
		admins: memberIdsFromRole(
			input.adminRole,
			input.casdoorUsers,
			input.organization
		),
		projectAdmins: memberIdsFromRole(
			input.projectAdminRole,
			input.casdoorUsers,
			input.organization
		),
	};
}

/** 与登录时的优先级相同：平台管理员 → 项目管理员 → 普通用户。 */
function desiredRole(
	local: CasdoorShadowUser,
	members: PlatformRoleMembers | null
): UserRole {
	if (members === null || !local.externalId) {
		return local.role;
	}
	if (members.admins.ids.has(local.externalId)) {
		return "admin";
	}
	if (members.projectAdmins.ids.has(local.externalId)) {
		return "project_admin";
	}
	return "member";
}

/**
 * 对账（plan 021 T11a、D13、#15）：按 Casdoor 同步本地 Casdoor 用户的 role 和 disabled_at。
 * Casdoor 中禁用、删除或不存在的用户设置 disabled_at；Casdoor 重新启用后清除它。
 * 输入的 localUsers 只能是 auth_source = casdoor 的用户。
 */
export function planReconcile(input: ReconcileInput): ReconcilePlan {
	const remoteById = new Map(
		input.casdoorUsers
			.filter((user) => user.owner === input.organization && user.id !== "")
			.map((user) => [user.id, user] as const)
	);
	const members = platformRoleMembers(input);
	const plan: ReconcilePlan = {
		changes: [],
		warnings: members
			? [...members.admins.warnings, ...members.projectAdmins.warnings]
			: [],
	};
	for (const local of input.localUsers) {
		if (!local.externalId) {
			plan.warnings.push(
				`本地 Casdoor 用户「${local.username}」没有 external_id，跳过。`
			);
			continue;
		}
		const changes: ReconcileChange["changes"] = {};
		const disabledAt = disabledChange(
			local,
			remoteById.get(local.externalId),
			input.now
		);
		if (disabledAt !== undefined) {
			changes.disabledAt = disabledAt;
		}
		const role = desiredRole(local, members);
		if (role !== local.role) {
			changes.role = role;
		}
		if (Object.keys(changes).length > 0) {
			plan.changes.push({ changes, id: local.id, username: local.username });
		}
	}
	return plan;
}
