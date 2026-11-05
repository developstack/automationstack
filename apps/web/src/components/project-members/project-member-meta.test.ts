import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { describe, expect, it } from "vitest";

import {
	allowedProjectRole,
	canManageProjectMembers,
	isSuspendedOwner,
	type ProjectRoleHolder,
	projectMemberActionsFor,
	projectRoleLabelFor,
	projectRoleOptionsFor,
	viewerProjectRoleLabel,
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

function optionValues(
	platformRole: UserRole | undefined,
	currentRole?: ProjectRole
) {
	return projectRoleOptionsFor(platformRole, currentRole).map(
		(option) => option.value
	);
}

describe("projectRoleOptionsFor：只列出能选的项目角色", () => {
	it.each([
		["admin", undefined, ["member", "owner"]],
		["project_admin", undefined, ["member", "owner"]],
		["member", undefined, ["member"]],
		[undefined, undefined, ["member"]],
		["member", "owner", ["member", "owner"]],
	] as const)(
		"平台角色 %s，当前项目角色 %s：%j",
		(platformRole, currentRole, expected) => {
			expect(optionValues(platformRole, currentRole)).toEqual(expected);
		}
	);
});

describe("allowedProjectRole：只有能成为拥有者的账号可以提交「拥有者」", () => {
	it.each([
		["owner", "admin", "owner"],
		["owner", "project_admin", "owner"],
		["owner", "member", "member"],
		["owner", undefined, "member"],
		["member", "admin", "member"],
	] as const)("选 %s，平台角色 %s：%s", (role, platformRole, expected) => {
		expect(allowedProjectRole(role, platformRole)).toBe(expected);
	});
});

describe("projectMemberActionsFor：成员行的菜单只列出服务端允许的操作", () => {
	const input = (
		role: ProjectRole,
		platformRole: UserRole,
		ownerCount: number,
		isSelf = false
	) => ({ isSelf, member: { platformRole, role }, ownerCount });

	it.each([
		[
			"另有拥有者的拥有者：设为成员、移出",
			input("owner", "project_admin", 2),
			["demote", "remove"],
		],
		[
			"唯一的拥有者：不能设为成员，不能移出",
			input("owner", "project_admin", 1),
			[],
		],
		[
			"项目管理员成员：设为拥有者、移出",
			input("member", "project_admin", 1),
			["promote", "remove"],
		],
		["普通用户成员：不能设为拥有者", input("member", "member", 1), ["remove"]],
		["本人：不能移出", input("owner", "admin", 2, true), ["demote"]],
	] as const)("%s", (_name, actionsInput, expected) => {
		expect(projectMemberActionsFor(actionsInput)).toEqual(expected);
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

describe("viewerProjectRoleLabel：项目切换器显示当前用户在项目中的角色", () => {
	it.each([
		["project_admin", OWNER_ID, "拥有者"],
		["member", OWNER_ID, "拥有者（管理权限已暂停）"],
		["member", MEMBER_ID, "成员"],
		["admin", MEMBER_ID, "成员"],
		["admin", OUTSIDER_ID, "平台管理员"],
	] as const)("平台角色 %s，用户 %s：%s", (role, id, expected) => {
		expect(viewerProjectRoleLabel({ id, role }, MEMBERS)).toBe(expected);
	});

	it("不在成员列表里的非平台管理员：没有项目角色", () => {
		expect(
			viewerProjectRoleLabel(
				{ id: OUTSIDER_ID, role: "project_admin" },
				MEMBERS
			)
		).toBeNull();
	});
});
