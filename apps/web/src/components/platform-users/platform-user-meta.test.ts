import { describe, expect, it } from "vitest";

import {
	isUserRole,
	PLATFORM_ROLE_LABEL,
	PLATFORM_ROLE_OPTIONS,
	roleChangeTargets,
} from "./platform-user-meta";

describe("PLATFORM_ROLE_LABEL：平台角色的中文名称与 CONTEXT.md 一致", () => {
	it("管理员、普通用户", () => {
		expect(PLATFORM_ROLE_LABEL).toEqual({
			admin: "管理员",
			member: "普通用户",
		});
	});
});

describe("PLATFORM_ROLE_OPTIONS：新建用户时可以选择两个平台角色", () => {
	it("按权限从低到高排列", () => {
		expect(PLATFORM_ROLE_OPTIONS.map((option) => option.value)).toEqual([
			"member",
			"admin",
		]);
	});
});

describe("isUserRole", () => {
	it.each(["admin", "member"])("%s：是平台角色", (value) => {
		expect(isUserRole(value)).toBe(true);
	});

	it.each(["owner", "project_admin", "", null])("%s：不是平台角色", (value) => {
		expect(isUserRole(value)).toBe(false);
	});
});

describe("roleChangeTargets：用户菜单中可以改成的平台角色", () => {
	it.each([
		["admin", ["member"]],
		["member", ["admin"]],
	] as const)("当前是 %s：可以改成 %j", (current, targets) => {
		expect(roleChangeTargets(current)).toEqual(targets);
	});
});
