import { describe, expect, it } from "vitest";

import {
	canManageProjectMembers,
	projectMemberLabelFor,
	viewerProjectRoleLabel,
} from "@/components/project-members/project-member-meta";

const SELF_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("canManageProjectMembers：与服务端的 canAdministerProject 一致", () => {
	it.each([
		["管理员", { id: SELF_ID, role: "admin" as const }, true],
		["普通用户", { id: SELF_ID, role: "member" as const }, false],
		["会话还没到（或已登出）", null, false],
	])("%s：%s", (_name, session, expected) => {
		expect(canManageProjectMembers(session)).toBe(expected);
	});
});

describe("projectMemberLabelFor：成员列表中的角色", () => {
	it.each([
		["admin", "管理员"],
		["member", "成员"],
	] as const)("平台角色 %s：%s", (platformRole, label) => {
		expect(projectMemberLabelFor({ platformRole })).toBe(label);
	});
});

describe("viewerProjectRoleLabel：项目切换器显示当前用户在项目中的角色", () => {
	const members = [{ platformRole: "member" as const, userId: SELF_ID }];

	it.each([
		["管理员（不在项目里也显示）", "admin", OTHER_ID, "管理员"],
		["项目成员中的普通用户", "member", SELF_ID, "成员"],
		["不在成员列表里的普通用户", "member", OTHER_ID, null],
	] as const)("%s", (_name, role, id, expected) => {
		expect(viewerProjectRoleLabel({ id, role }, members)).toBe(expected);
	});
});
