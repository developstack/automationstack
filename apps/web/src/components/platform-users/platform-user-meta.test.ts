import { describe, expect, it } from "vitest";

import {
	isUserRole,
	PLATFORM_ROLE_LABEL,
	PLATFORM_ROLE_OPTIONS,
	roleChangeTargets,
} from "./platform-user-meta";

describe("PLATFORM_ROLE_LABEL：平台角色的中文名称与 CONTEXT.md 一致", () => {
	it("平台管理员、项目管理员、普通用户", () => {
		expect(PLATFORM_ROLE_LABEL).toEqual({
			admin: "平台管理员",
			member: "普通用户",
			project_admin: "项目管理员",
		});
	});
});

describe("PLATFORM_ROLE_OPTIONS：新建用户时可以选择三个平台角色", () => {
	it("按权限从低到高排列", () => {
		expect(PLATFORM_ROLE_OPTIONS.map((option) => option.value)).toEqual([
			"member",
			"project_admin",
			"admin",
		]);
	});
});

describe("isUserRole", () => {
	it.each(["admin", "project_admin", "member"])("%s：是平台角色", (value) => {
		expect(isUserRole(value)).toBe(true);
	});

	it.each(["owner", "", null])("%s：不是平台角色", (value) => {
		expect(isUserRole(value)).toBe(false);
	});
});

describe("roleChangeTargets：用户菜单中可以改成的平台角色", () => {
	it.each([
		["admin", ["member", "project_admin"]],
		["project_admin", ["member", "admin"]],
		["member", ["project_admin", "admin"]],
	] as const)("当前是 %s：可以改成 %j", (current, targets) => {
		expect(roleChangeTargets(current)).toEqual(targets);
	});
});
