import { describe, expect, it } from "vitest";

import { identityFromClaims, platformRoleFromRoles } from "./claims";

const ORG = "automationstack";
const ADMIN_ROLE = "automationstack-admin";
const PROJECT_ADMIN_ROLE = "automationstack-project-admin";
const options = {
	adminRole: ADMIN_ROLE,
	organization: ORG,
	projectAdminRole: PROJECT_ADMIN_ROLE,
};

const adminRole = { isEnabled: true, name: ADMIN_ROLE, owner: ORG };
const projectAdminRole = {
	isEnabled: true,
	name: PROJECT_ADMIN_ROLE,
	owner: ORG,
};

function claims(overrides: Record<string, unknown> = {}) {
	return {
		isDeleted: false,
		isForbidden: false,
		name: "alice",
		owner: ORG,
		roles: [adminRole],
		sub: "4e1fe32c-0000-4000-8000-000000000001",
		...overrides,
	};
}

describe("platformRoleFromRoles（D4、§11.10 第 5 项）", () => {
	it("本组织、角色名相同、isEnabled === true：admin", () => {
		expect(platformRoleFromRoles([adminRole], options)).toBe("admin");
	});

	it("角色被禁用（isEnabled: false）：member", () => {
		expect(
			platformRoleFromRoles([{ ...adminRole, isEnabled: false }], options)
		).toBe("member");
	});

	it("isEnabled 缺失：member", () => {
		expect(
			platformRoleFromRoles([{ name: ADMIN_ROLE, owner: ORG }], options)
		).toBe("member");
	});

	it("其他组织的同名角色：member", () => {
		expect(
			platformRoleFromRoles([{ ...adminRole, owner: "built-in" }], options)
		).toBe("member");
	});

	it("roles 缺失、为空或不是数组：member", () => {
		expect(platformRoleFromRoles(undefined, options)).toBe("member");
		expect(platformRoleFromRoles([], options)).toBe("member");
		expect(platformRoleFromRoles("automationstack-admin", options)).toBe(
			"member"
		);
	});

	it("字符串形式的角色名（userinfo 的格式）不被接受：member", () => {
		expect(platformRoleFromRoles([ADMIN_ROLE], options)).toBe("member");
		expect(platformRoleFromRoles([PROJECT_ADMIN_ROLE], options)).toBe("member");
	});
});

describe("platformRoleFromRoles：项目管理员角色（#15）", () => {
	it("只有已启用的项目管理员角色：project_admin", () => {
		expect(platformRoleFromRoles([projectAdminRole], options)).toBe(
			"project_admin"
		);
	});

	it("同时有两个角色：平台管理员优先，与顺序无关", () => {
		expect(platformRoleFromRoles([projectAdminRole, adminRole], options)).toBe(
			"admin"
		);
		expect(platformRoleFromRoles([adminRole, projectAdminRole], options)).toBe(
			"admin"
		);
	});

	it("项目管理员角色被禁用：member", () => {
		expect(
			platformRoleFromRoles(
				[{ ...projectAdminRole, isEnabled: false }],
				options
			)
		).toBe("member");
	});

	it("平台管理员角色被禁用、项目管理员角色已启用：project_admin", () => {
		expect(
			platformRoleFromRoles(
				[{ ...adminRole, isEnabled: false }, projectAdminRole],
				options
			)
		).toBe("project_admin");
	});

	it("其他组织的项目管理员角色：member", () => {
		expect(
			platformRoleFromRoles(
				[{ ...projectAdminRole, owner: "built-in" }],
				options
			)
		).toBe("member");
	});

	it("其他组织的平台管理员角色不覆盖本组织的项目管理员角色：project_admin", () => {
		expect(
			platformRoleFromRoles(
				[{ ...adminRole, owner: "built-in" }, projectAdminRole],
				options
			)
		).toBe("project_admin");
	});
});

describe("identityFromClaims（§11.9 T10）", () => {
	it("正常：external_id = sub，用户名 = name，角色按 roles 计算", () => {
		expect(identityFromClaims(claims(), options)).toEqual({
			identity: {
				externalId: "4e1fe32c-0000-4000-8000-000000000001",
				role: "admin",
				username: "alice",
			},
			kind: "ok",
		});
	});

	it("项目管理员角色：登录成功，角色为 project_admin", () => {
		const result = identityFromClaims(
			claims({ roles: [projectAdminRole] }),
			options
		);
		expect(result).toMatchObject({
			identity: { role: "project_admin" },
			kind: "ok",
		});
	});

	it("roles 缺失：登录成功，角色为 member", () => {
		const result = identityFromClaims(claims({ roles: undefined }), options);
		expect(result).toMatchObject({ identity: { role: "member" }, kind: "ok" });
	});

	it("sub 为空或缺失：拒绝", () => {
		expect(identityFromClaims(claims({ sub: "" }), options)).toEqual({
			kind: "rejected",
			reason: "missing-sub",
		});
		expect(identityFromClaims(claims({ sub: "  " }), options)).toMatchObject({
			reason: "missing-sub",
		});
		expect(
			identityFromClaims(claims({ sub: undefined }), options)
		).toMatchObject({ reason: "missing-sub" });
	});

	it("owner 不是配置的组织：拒绝", () => {
		expect(identityFromClaims(claims({ owner: "built-in" }), options)).toEqual({
			kind: "rejected",
			reason: "wrong-organization",
		});
	});

	it("isForbidden 或 isDeleted 为 true：拒绝", () => {
		expect(
			identityFromClaims(claims({ isForbidden: true }), options)
		).toMatchObject({ reason: "forbidden" });
		expect(
			identityFromClaims(claims({ isDeleted: true }), options)
		).toMatchObject({ reason: "forbidden" });
	});

	it("name 为空：拒绝", () => {
		expect(identityFromClaims(claims({ name: "" }), options)).toMatchObject({
			reason: "missing-username",
		});
	});
});
