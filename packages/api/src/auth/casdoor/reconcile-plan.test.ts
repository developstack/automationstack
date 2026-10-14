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

function change(name: string, changes: Record<string, unknown>) {
	return { changes, id: `local-${name}`, username: name };
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

const REMOTE_USERS = [remote("alice"), remote("bob"), remote("carol")];

describe("memberIdsFromRole（T11）", () => {
	it("「组织/用户名」按 Casdoor 用户列表转换为 id", () => {
		expect(
			memberIdsFromRole(role([`${ORG}/alice`]), REMOTE_USERS, ORG).ids
		).toEqual(new Set(["id-alice"]));
	});

	it("其他组织的成员和通配符：丢弃并写 WARN", () => {
		const result = memberIdsFromRole(
			role(["built-in/alice", `${ORG}/*`, `${ORG}/ghost`, "noslash"]),
			REMOTE_USERS,
			ORG
		);
		expect(result.ids.size).toBe(0);
		expect(result.warnings).toHaveLength(4);
	});

	it("角色被禁用：没有成员", () => {
		expect(
			memberIdsFromRole(role([`${ORG}/alice`], false), REMOTE_USERS, ORG).ids
				.size
		).toBe(0);
	});
});

describe("planReconcile（T11a；项目管理员角色 #15）", () => {
	it.each([
		{
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice"), remote("bob")],
			expected: [
				change("alice", { role: "admin" }),
				change("bob", { role: "member" }),
			],
			localUsers: [local("alice"), local("bob", { role: "admin" })],
			name: "加入角色：member → admin；移出角色：admin → member",
		},
		{
			casdoorUsers: [remote("bob")],
			expected: [change("bob", { disabledAt: null })],
			localUsers: [
				local("bob", { disabledAt: new Date("2026-01-01T00:00:00Z") }),
			],
			name: "Casdoor 重新启用：清除 disabled_at",
		},
		{
			adminRole: null,
			casdoorUsers: [remote("alice")],
			expected: [],
			localUsers: [local("alice", { role: "admin" })],
			name: "管理员角色不存在（null）：不修改任何角色",
		},
		{
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice")],
			expected: [],
			localUsers: [local("alice", { role: "admin" })],
			name: "状态一致：没有修改",
		},
		{
			casdoorUsers: REMOTE_USERS,
			expected: [
				change("alice", { role: "project_admin" }),
				change("bob", { role: "member" }),
			],
			localUsers: [local("alice"), local("bob", { role: "project_admin" })],
			name: "只在项目管理员角色中：project_admin；两个角色都没有：member",
			projectAdminRole: projectRole([`${ORG}/alice`]),
		},
		{
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: REMOTE_USERS,
			expected: [change("alice", { role: "admin" })],
			localUsers: [local("alice", { role: "project_admin" })],
			name: "同时在两个角色中：平台管理员优先",
			projectAdminRole: projectRole([`${ORG}/alice`]),
		},
		{
			adminRole: role([`${ORG}/carol`]),
			casdoorUsers: REMOTE_USERS,
			expected: [change("alice", { role: "member" })],
			localUsers: [
				local("alice", { role: "project_admin" }),
				local("carol", { role: "admin" }),
			],
			name: "项目管理员角色被禁用：成员变为 member，有平台管理员角色的成员仍是 admin",
			projectAdminRole: projectRole([`${ORG}/alice`, `${ORG}/carol`], false),
		},
		{
			adminRole: role([`${ORG}/alice`], false),
			casdoorUsers: REMOTE_USERS,
			expected: [change("alice", { role: "project_admin" })],
			localUsers: [local("alice", { role: "admin" })],
			name: "平台管理员角色被禁用：项目管理员角色的成员是 project_admin",
			projectAdminRole: projectRole([`${ORG}/alice`]),
		},
		{
			adminRole: role([`${ORG}/alice`]),
			casdoorUsers: [remote("alice"), remote("bob", { isForbidden: true })],
			expected: [change("bob", { disabledAt: NOW })],
			localUsers: [local("alice"), local("bob", { role: "project_admin" })],
			name: "项目管理员角色不存在（null）：不修改任何角色，仍同步禁用状态",
			projectAdminRole: null,
		},
	])("$name", ({ expected, name: _name, ...input }) => {
		expect(plan(input).changes).toEqual(expected);
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
		expect(result.changes).toContainEqual(
			change("old-name", { role: "admin" })
		);
		expect(
			result.changes.find((entry) => entry.id === "local-alice")?.changes.role
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
			result.changes.map((entry) => [entry.id, entry.changes.disabledAt])
		).toEqual([
			["local-bob", NOW],
			["local-carol", NOW],
			["local-dave", NOW],
		]);
	});

	it("其他组织的同 id 用户不算存在", () => {
		const result = plan({
			casdoorUsers: [remote("bob", { owner: "built-in" })],
			localUsers: [local("bob")],
		});
		expect(result.changes[0]?.changes.disabledAt).toEqual(NOW);
	});

	it("其他组织的项目管理员角色成员：丢弃并写 WARN，不授予 project_admin", () => {
		const result = plan({
			casdoorUsers: REMOTE_USERS,
			localUsers: [local("alice")],
			projectAdminRole: projectRole(["built-in/alice"]),
		});
		expect(result.changes).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("automationstack-project-admin");
	});
});
