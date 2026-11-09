import { describe, expect, it } from "vitest";

import {
	canAdministerProject,
	canCreateProject,
	canEnterProject,
	seesAllProjects,
} from "./project-access";

describe("按平台角色和成员关系判断项目权限", () => {
	// 平台角色 × 是否是项目成员的全部组合。
	it.each([
		["admin", "管理员", true, true, true],
		["admin", "管理员", false, true, true],
		["member", "普通用户", true, true, false],
		[
			"member",
			"普通用户（不是成员时进不去：这条一旦失效，等于没有项目级授权）",
			false,
			false,
			false,
		],
	] as const)(
		"%s（%s），是成员 %s：能进入 %s，能管理 %s",
		(platformRole, _label, isMember, canEnter, canAdminister) => {
			expect(canEnterProject({ isMember, platformRole })).toBe(canEnter);
			expect(canAdministerProject({ platformRole })).toBe(canAdminister);
		}
	);
});

describe("按平台角色判断：新建项目、projects.list 要不要过滤", () => {
	it.each([
		["admin", "管理员", true],
		["member", "普通用户", false],
	] as const)(
		"%s（%s）：能新建项目和看全部项目都是 %s",
		(platformRole, _label, expected) => {
			expect(canCreateProject(platformRole)).toBe(expected);
			// 看不到全部项目的角色只看自己所属的——list 因此必须走 listProjectsByMember
			expect(seesAllProjects(platformRole)).toBe(expected);
		}
	);
});
