import { describe, expect, it } from "vitest";

import { platformRoleFor } from "./platform-role";

describe("platformRoleFor：平台管理员 → 项目管理员 → 普通用户（#15）", () => {
	it.each([
		[true, true, "admin"],
		[true, false, "admin"],
		[false, true, "project_admin"],
		[false, false, "member"],
	] as const)(
		"平台管理员角色 %s、项目管理员角色 %s：%s",
		(isAdmin, isProjectAdmin, expected) => {
			expect(platformRoleFor({ isAdmin, isProjectAdmin })).toBe(expected);
		}
	);
});
