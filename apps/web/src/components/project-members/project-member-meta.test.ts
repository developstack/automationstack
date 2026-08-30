import { describe, expect, it } from "vitest";

import {
	canManageProjectMembers,
	type ProjectRoleHolder,
} from "@/components/project-members/project-member-meta";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const OUTSIDER_ID = "33333333-3333-4333-8333-333333333333";

const MEMBERS: ProjectRoleHolder[] = [
	{ role: "owner", userId: OWNER_ID },
	{ role: "member", userId: MEMBER_ID },
];

describe("canManageProjectMembers", () => {
	it("放行本项目的 owner", () => {
		expect(
			canManageProjectMembers({ id: OWNER_ID, role: "member" }, MEMBERS)
		).toBe(true);
	});

	it("拦下本项目的普通成员：他只能看名单", () => {
		expect(
			canManageProjectMembers({ id: MEMBER_ID, role: "member" }, MEMBERS)
		).toBe(false);
	});

	it("放行平台 admin，哪怕他根本不在名单里", () => {
		expect(
			canManageProjectMembers({ id: OUTSIDER_ID, role: "admin" }, MEMBERS)
		).toBe(true);
	});

	it("拦下不在名单里的普通账号", () => {
		expect(
			canManageProjectMembers({ id: OUTSIDER_ID, role: "member" }, MEMBERS)
		).toBe(false);
	});

	it("会话还没到（或已登出）时一律不给操作控件", () => {
		expect(canManageProjectMembers(null, MEMBERS)).toBe(false);
	});

	it("名单为空时普通账号同样拦下：空名单不等于人人是 owner", () => {
		expect(canManageProjectMembers({ id: OWNER_ID, role: "member" }, [])).toBe(
			false
		);
	});
});
