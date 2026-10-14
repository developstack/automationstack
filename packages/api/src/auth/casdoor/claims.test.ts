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
const disabled = { isEnabled: false };
const otherOrg = { owner: "built-in" };

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

describe("platformRoleFromRoles（D4、§11.10 第 5 项；项目管理员角色 #15）", () => {
	it.each([
		["本组织、角色名相同、isEnabled === true", [adminRole], "admin"],
		[
			"角色被禁用（isEnabled: false）",
			[{ ...adminRole, ...disabled }],
			"member",
		],
		["isEnabled 缺失", [{ name: ADMIN_ROLE, owner: ORG }], "member"],
		["其他组织的同名角色", [{ ...adminRole, ...otherOrg }], "member"],
		["roles 缺失", undefined, "member"],
		["roles 为空", [], "member"],
		["roles 不是数组", "automationstack-admin", "member"],
		["字符串形式的管理员角色名（userinfo 的格式）", [ADMIN_ROLE], "member"],
		["字符串形式的项目管理员角色名", [PROJECT_ADMIN_ROLE], "member"],
		["只有已启用的项目管理员角色", [projectAdminRole], "project_admin"],
		["两个角色，项目管理员在前", [projectAdminRole, adminRole], "admin"],
		["两个角色，平台管理员在前", [adminRole, projectAdminRole], "admin"],
		["项目管理员角色被禁用", [{ ...projectAdminRole, ...disabled }], "member"],
		[
			"平台管理员角色被禁用、项目管理员角色已启用",
			[{ ...adminRole, ...disabled }, projectAdminRole],
			"project_admin",
		],
		[
			"其他组织的项目管理员角色",
			[{ ...projectAdminRole, ...otherOrg }],
			"member",
		],
		[
			"其他组织的平台管理员角色不覆盖本组织的项目管理员角色",
			[{ ...adminRole, ...otherOrg }, projectAdminRole],
			"project_admin",
		],
	] as const)("%s：%s", (_name, roles, expected) => {
		expect(platformRoleFromRoles(roles, options)).toBe(expected);
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

	it.each([
		["项目管理员角色", { roles: [projectAdminRole] }, "project_admin"],
		["roles 缺失", { roles: undefined }, "member"],
	])("%s：登录成功，角色为 %s", (_name, overrides, role) => {
		expect(identityFromClaims(claims(overrides), options)).toMatchObject({
			identity: { role },
			kind: "ok",
		});
	});

	it.each([
		["sub 为空", { sub: "" }, "missing-sub"],
		["sub 只有空白", { sub: "  " }, "missing-sub"],
		["sub 缺失", { sub: undefined }, "missing-sub"],
		["owner 不是配置的组织", { owner: "built-in" }, "wrong-organization"],
		["isForbidden 为 true", { isForbidden: true }, "forbidden"],
		["isDeleted 为 true", { isDeleted: true }, "forbidden"],
		["name 为空", { name: "" }, "missing-username"],
	])("%s：拒绝（%s）", (_name, overrides, reason) => {
		expect(identityFromClaims(claims(overrides), options)).toEqual({
			kind: "rejected",
			reason,
		});
	});
});
