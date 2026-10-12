import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { describe, expect, it } from "vitest";

import {
	allowedProjectRole,
	canManageProjectMembers,
	isSuspendedOwner,
	type ProjectRoleHolder,
	projectRoleLabelFor,
	projectRoleOptionsFor,
} from "@/components/project-members/project-member-meta";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const OUTSIDER_ID = "33333333-3333-4333-8333-333333333333";

const MEMBERS: ProjectRoleHolder[] = [
	{ role: "owner", userId: OWNER_ID },
	{ role: "member", userId: MEMBER_ID },
];

const ID_FOR_ROLE: Record<ProjectRole | "none", string> = {
	member: MEMBER_ID,
	none: OUTSIDER_ID,
	owner: OWNER_ID,
};

describe("canManageProjectMembers：与服务端的 canAdministerProject 一致", () => {
	it.each([
		["admin", "owner", true],
		["admin", "member", true],
		["admin", "none", true],
		["project_admin", "owner", true],
		["project_admin", "member", false],
		["project_admin", "none", false],
		["member", "owner", false],
		["member", "member", false],
		["member", "none", false],
	] as const)(
		"平台角色 %s + 项目角色 %s：%s",
		(role, projectRole, expected) => {
			const session = { id: ID_FOR_ROLE[projectRole], role };
			expect(canManageProjectMembers(session, MEMBERS)).toBe(expected);
		}
	);

	it("会话还没到（或已登出）时一律不给操作控件", () => {
		expect(canManageProjectMembers(null, MEMBERS)).toBe(false);
	});

	it("名单为空时项目管理员同样拦下：空名单不等于人人是 owner", () => {
		expect(
			canManageProjectMembers({ id: OWNER_ID, role: "project_admin" }, [])
		).toBe(false);
	});
});

describe("isSuspendedOwner：降级为普通用户的项目 owner 暂停管理", () => {
	it.each([
		["member", OWNER_ID, true],
		["project_admin", OWNER_ID, false],
		["admin", OWNER_ID, false],
		["member", MEMBER_ID, false],
		["member", OUTSIDER_ID, false],
	] as const)("平台角色 %s，用户 %s：%s", (role, id, expected) => {
		expect(isSuspendedOwner({ id, role }, MEMBERS)).toBe(expected);
	});

	it("会话为空：false", () => {
		expect(isSuspendedOwner(null, MEMBERS)).toBe(false);
	});
});

function ownerOptionDisabled(platformRole: UserRole | undefined) {
	return projectRoleOptionsFor(platformRole).find(
		(option) => option.value === "owner"
	)?.disabled;
}

describe("projectRoleOptionsFor：普通用户不提供「拥有者」选项", () => {
	it.each([
		["admin", false],
		["project_admin", false],
		["member", true],
		[undefined, false],
	] as const)("平台角色 %s：拥有者选项禁用 = %s", (platformRole, expected) => {
		expect(ownerOptionDisabled(platformRole) ?? false).toBe(expected);
	});

	it("「成员」选项总是可选", () => {
		const member = projectRoleOptionsFor("member").find(
			(option) => option.value === "member"
		);
		expect(member?.disabled ?? false).toBe(false);
	});
});

describe("allowedProjectRole：普通用户的项目角色只能是成员", () => {
	it.each([
		["owner", "admin", "owner"],
		["owner", "project_admin", "owner"],
		["owner", "member", "member"],
		["owner", undefined, "owner"],
		["member", "member", "member"],
	] as const)("选 %s，平台角色 %s：%s", (role, platformRole, expected) => {
		expect(allowedProjectRole(role, platformRole)).toBe(expected);
	});
});

describe("projectRoleLabelFor：被暂停的项目 owner 在名单里标出", () => {
	it.each([
		["owner", "project_admin", "拥有者"],
		["owner", "admin", "拥有者"],
		["owner", "member", "拥有者（管理权限已暂停）"],
		["member", "member", "成员"],
	] as const)(
		"项目角色 %s，平台角色 %s：%s",
		(role, platformRole, expected) => {
			expect(projectRoleLabelFor({ platformRole, role })).toBe(expected);
		}
	);
});
