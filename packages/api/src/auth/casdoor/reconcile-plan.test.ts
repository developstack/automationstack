import type { CasdoorShadowUser } from "@automationstack/db/repositories/casdoor-users-repository";
import { describe, expect, it } from "vitest";

import type {
	CasdoorRoleRecord,
	CasdoorUserRecord,
} from "./management-records";
import { adminIdsFromRole, planReconcile } from "./reconcile-plan";

const ORG = "automationstack";
const NOW = new Date("2026-10-09T00:00:00Z");

function remote(
	name: string,
	overrides: Partial<CasdoorUserRecord> = {}
): CasdoorUserRecord {
	return {
		id: `id-${name}`,
		isDeleted: false,
		isForbidden: false,
		name,
		owner: ORG,
		...overrides,
	};
}

function local(
	name: string,
	overrides: Partial<CasdoorShadowUser> = {}
): CasdoorShadowUser {
	return {
		disabledAt: null,
		externalId: `id-${name}`,
		id: `local-${name}`,
		role: "member",
		username: name,
		...overrides,
	};
}

function role(users: string[], isEnabled = true): CasdoorRoleRecord {
	return { isEnabled, name: "automationstack-admin", owner: ORG, users };
}

function plan(input: {
	adminRole?: CasdoorRoleRecord | null;
	casdoorUsers: CasdoorUserRecord[];
	localUsers: CasdoorShadowUser[];
}) {
	return planReconcile({
		adminRole: input.adminRole === undefined ? role([]) : input.adminRole,
		casdoorUsers: input.casdoorUsers,
		localUsers: input.localUsers,
		now: NOW,
		organization: ORG,
	});
}

describe("adminIdsFromRole（T11）", () => {
	const users = [remote("alice"), remote("bob")];

	it("「组织/用户名」按 Casdoor 用户列表转换为 id", () => {
		expect(adminIdsFromRole(role([`${ORG}/alice`]), users, ORG).ids).toEqual(
			new Set(["id-alice"])
		);
	});

	it("其他组织的成员和通配符：丢弃并写 WARN", () => {
		const result = adminIdsFromRole(
			role(["built-in/alice", `${ORG}/*`, `${ORG}/ghost`, "noslash"]),
			users,
			ORG
		);
		expect(result.ids.size).toBe(0);
		expect(result.warnings).toHaveLength(4);
	});

	it("角色被关闭：没有管理员", () => {
		expect(
			adminIdsFromRole(role([`${ORG}/alice`], false), users, ORG).ids.size
		).toBe(0);
	});
});

describe("planReconcile（T11a）", () => {
	it("加入角色：member → admin；移出角色：admin → member", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice"), remote("bob")],
			localUsers: [local("alice"), local("bob", { role: "admin" })],
		});
		expect(result.changes).toEqual([
			{ changes: { role: "admin" }, id: "local-alice", username: "alice" },
			{ changes: { role: "member" }, id: "local-bob", username: "bob" },
		]);
	});

	it("不使用本地 username 匹配：本地用户名过时也按 external_id 同步", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice")],
			localUsers: [
				local("old-name", { externalId: "id-alice" }),
				local("alice", { externalId: "id-other" }),
			],
		});
		expect(result.changes).toContainEqual({
			changes: { role: "admin" },
			id: "local-old-name",
			username: "old-name",
		});
		expect(
			result.changes.find((change) => change.id === "local-alice")?.changes.role
		).toBeUndefined();
	});

	it("Casdoor 中禁用、删除或不存在：设置 disabled_at", () => {
		const result = plan({
			casdoorUsers: [
				remote("bob", { isForbidden: true }),
				remote("carol", { isDeleted: true }),
			],
			localUsers: [local("bob"), local("carol"), local("dave")],
		});
		expect(
			result.changes.map((change) => [change.id, change.changes.disabledAt])
		).toEqual([
			["local-bob", NOW],
			["local-carol", NOW],
			["local-dave", NOW],
		]);
	});

	it("Casdoor 重新启用：清除 disabled_at", () => {
		const result = plan({
			casdoorUsers: [remote("bob")],
			localUsers: [
				local("bob", { disabledAt: new Date("2026-01-01T00:00:00Z") }),
			],
		});
		expect(result.changes).toEqual([
			{ changes: { disabledAt: null }, id: "local-bob", username: "bob" },
		]);
	});

	it("其他组织的同 id 用户不算存在", () => {
		const result = plan({
			casdoorUsers: [remote("bob", { owner: "built-in" })],
			localUsers: [local("bob")],
		});
		expect(result.changes[0]?.changes.disabledAt).toEqual(NOW);
	});

	it("管理员角色不存在（null）：不修改任何角色", () => {
		const result = plan({
			adminRole: null,
			casdoorUsers: [remote("alice")],
			localUsers: [local("alice", { role: "admin" })],
		});
		expect(result.changes).toEqual([]);
	});

	it("状态一致：没有修改", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice")],
			localUsers: [local("alice", { role: "admin" })],
		});
		expect(result.changes).toEqual([]);
	});
});
