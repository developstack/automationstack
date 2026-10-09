import type { CasdoorShadowUser } from "@automationstack/db/repositories/casdoor-users-repository";
import type { UserRole } from "@automationstack/db/schema/users";

import type {
	CasdoorRoleRecord,
	CasdoorUserRecord,
} from "./management-records";

const WILDCARD = "*";

export interface ReconcileInput {
	/** null 表示管理员角色不存在：不修改任何角色（§11.9 T11a）。 */
	adminRole: CasdoorRoleRecord | null;
	casdoorUsers: readonly CasdoorUserRecord[];
	localUsers: readonly CasdoorShadowUser[];
	now: Date;
	organization: string;
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

interface AdminIds {
	ids: Set<string>;
	warnings: string[];
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
export function adminIdsFromRole(
	role: CasdoorRoleRecord,
	users: readonly CasdoorUserRecord[],
	organization: string
): AdminIds {
	const result: AdminIds = { ids: new Set(), warnings: [] };
	if (!role.isEnabled) {
		// 角色被关闭时，全部成员按 member 处理（§11.9）。
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
			result.warnings.push(`丢弃管理员角色中其他组织的成员「${member}」。`);
		} else if (parsed.name.includes(WILDCARD)) {
			result.warnings.push(`丢弃管理员角色中的通配符成员「${member}」。`);
		} else {
			id = idByName.get(parsed.name);
			if (id === undefined) {
				result.warnings.push(
					`管理员角色的成员「${member}」不在用户列表中，丢弃。`
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

function desiredRole(
	local: CasdoorShadowUser,
	admins: AdminIds | null
): UserRole {
	if (admins === null || !local.externalId) {
		return local.role;
	}
	return admins.ids.has(local.externalId) ? "admin" : "member";
}

/**
 * 对账（plan 021 T11a、D13）：按 Casdoor 同步本地 Casdoor 用户的 role 和 disabled_at。
 * Casdoor 中禁用、删除或不存在的用户设置 disabled_at；Casdoor 重新启用后清除它。
 * 输入的 localUsers 只能是 auth_source = casdoor 的用户。
 */
export function planReconcile(input: ReconcileInput): ReconcilePlan {
	const remoteById = new Map(
		input.casdoorUsers
			.filter((user) => user.owner === input.organization && user.id !== "")
			.map((user) => [user.id, user] as const)
	);
	const admins =
		input.adminRole === null
			? null
			: adminIdsFromRole(
					input.adminRole,
					input.casdoorUsers,
					input.organization
				);
	const plan: ReconcilePlan = { changes: [], warnings: admins?.warnings ?? [] };
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
		const role = desiredRole(local, admins);
		if (role !== local.role) {
			changes.role = role;
		}
		if (Object.keys(changes).length > 0) {
			plan.changes.push({ changes, id: local.id, username: local.username });
		}
	}
	return plan;
}
