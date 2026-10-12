import type { CasdoorShadowUser } from "@automationstack/db/repositories/casdoor-users-repository";
import { describe, expect, it } from "vitest";

import type {
	CasdoorRoleRecord,
	CasdoorUserRecord,
} from "./management-records";
import { memberIdsFromRole, planReconcile } from "./reconcile-plan";

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

function role(
	users: string[],
	isEnabled = true,
	name = "automationstack-admin"
): CasdoorRoleRecord {
	return { isEnabled, name, owner: ORG, users };
}

function projectRole(users: string[], isEnabled = true): CasdoorRoleRecord {
	return role(users, isEnabled, "automationstack-project-admin");
}

function plan(input: {
	adminRole?: CasdoorRoleRecord | null;
	casdoorUsers: CasdoorUserRecord[];
	localUsers: CasdoorShadowUser[];
	projectAdminRole?: CasdoorRoleRecord | null;
}) {
	return planReconcile({
		adminRole: input.adminRole === undefined ? role([]) : input.adminRole,
		casdoorUsers: input.casdoorUsers,
		localUsers: input.localUsers,
		now: NOW,
		organization: ORG,
		projectAdminRole:
			input.projectAdminRole === undefined
				? projectRole([])
				: input.projectAdminRole,
	});
}

describe("memberIdsFromRole（T11）", () => {
	const users = [remote("alice"), remote("bob")];

	it("「组织/用户名」按 Casdoor 用户列表转换为 id", () => {
		expect(memberIdsFromRole(role([`${ORG}/alice`]), users, ORG).ids).toEqual(
			new Set(["id-alice"])
		);
	});

	it("其他组织的成员和通配符：丢弃并写 WARN", () => {
		const result = memberIdsFromRole(
			role(["built-in/alice", `${ORG}/*`, `${ORG}/ghost`, "noslash"]),
			users,
			ORG
		);
		expect(result.ids.size).toBe(0);
		expect(result.warnings).toHaveLength(4);
	});

	it("角色被禁用：没有成员", () => {
		expect(
			memberIdsFromRole(role([`${ORG}/alice`], false), users, ORG).ids.size
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

describe("planReconcile：项目管理员角色（#15）", () => {
	const users = [remote("alice"), remote("bob"), remote("carol")];

	it("只在项目管理员角色中：project_admin；两个角色都没有：member", () => {
		const result = plan({
			casdoorUsers: users,
			localUsers: [local("alice"), local("bob", { role: "project_admin" })],
			projectAdminRole: projectRole([`${ORG}/alice`]),
		});
		expect(result.changes).toEqual([
			{
				changes: { role: "project_admin" },
				id: "local-alice",
				username: "alice",
			},
			{ changes: { role: "member" }, id: "local-bob", username: "bob" },
		]);
	});

	it("同时在两个角色中：平台管理员优先", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: users,
			localUsers: [local("alice", { role: "project_admin" })],
			projectAdminRole: projectRole([`${ORG}/alice`]),
		});
		expect(result.changes).toEqual([
			{ changes: { role: "admin" }, id: "local-alice", username: "alice" },
		]);
	});

	it("项目管理员角色被禁用：成员变为 member，有平台管理员角色的成员仍是 admin", () => {
		const result = plan({
			adminRole: role([`${ORG}/carol`]),
			casdoorUsers: users,
			localUsers: [
				local("alice", { role: "project_admin" }),
				local("carol", { role: "admin" }),
			],
			projectAdminRole: projectRole([`${ORG}/alice`, `${ORG}/carol`], false),
		});
		expect(result.changes).toEqual([
			{ changes: { role: "member" }, id: "local-alice", username: "alice" },
		]);
	});

	it("平台管理员角色被禁用：项目管理员角色的成员是 project_admin", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`], false),
			casdoorUsers: users,
			localUsers: [local("alice", { role: "admin" })],
			projectAdminRole: projectRole([`${ORG}/alice`]),
		});
		expect(result.changes).toEqual([
			{
				changes: { role: "project_admin" },
				id: "local-alice",
				username: "alice",
			},
		]);
	});

	it("项目管理员角色不存在（null）：不修改任何角色，仍同步禁用状态", () => {
		const result = plan({
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice"), remote("bob", { isForbidden: true })],
			localUsers: [local("alice"), local("bob", { role: "project_admin" })],
			projectAdminRole: null,
		});
		expect(result.changes).toEqual([
			{ changes: { disabledAt: NOW }, id: "local-bob", username: "bob" },
		]);
	});

	it("其他组织的项目管理员角色成员：丢弃并写 WARN，不授予 project_admin", () => {
		const result = plan({
			casdoorUsers: users,
			localUsers: [local("alice")],
			projectAdminRole: projectRole(["built-in/alice"]),
		});
		expect(result.changes).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("automationstack-project-admin");
	});
});
