import { describe, expect, it } from "vitest";

import {
	canAdministerProject,
	canBecomeProjectOwner,
	canCreateProject,
	canEnterProject,
	isProjectOwnerSuspended,
	type ProjectAccess,
	seesAllProjects,
} from "./project-access";

const memberOfProject: ProjectAccess = {
	platformRole: "member",
	projectRole: "member",
};
const ownerOfProject: ProjectAccess = {
	platformRole: "member",
	projectRole: "owner",
};
const projectAdminOwnerOfProject: ProjectAccess = {
	platformRole: "project_admin",
	projectRole: "owner",
};
const strangerToProject: ProjectAccess = {
	platformRole: "member",
	projectRole: null,
};

const adminOutsideProject: ProjectAccess = {
	platformRole: "admin",
	projectRole: null,
};
const adminMemberOfProject: ProjectAccess = {
	platformRole: "admin",
	projectRole: "member",
};
const adminOwnerOfProject: ProjectAccess = {
	platformRole: "admin",
	projectRole: "owner",
};

describe("canEnterProject：谁能看见 / 进入一个项目", () => {
	it.each([
		["项目成员（member）能进", memberOfProject, true],
		["项目成员（owner）能进，与 member 无差别", ownerOfProject, true],
		[
			"不是成员的普通用户进不去——这条一旦失效，等于全仓没有项目级授权",
			strangerToProject,
			false,
		],
		["平台 admin 即使没有成员记录也能进", adminOutsideProject, true],
		["平台 admin 是 member 时能进", adminMemberOfProject, true],
		["平台 admin 是 owner 时能进", adminOwnerOfProject, true],
	])("%s", (_name, access, expected) => {
		expect(canEnterProject(access)).toBe(expected);
	});
});

describe("canAdministerProject：谁能改项目 / 删项目 / 管成员", () => {
	// 平台角色 × 项目角色的全部组合。管理项目必须同时满足"是项目 owner"和"平台角色至少是项目管理员"；平台管理员不受项目角色限制。
	it.each([
		["admin", "平台管理员", "owner", true],
		["admin", "平台管理员", "member", true],
		["admin", "平台管理员", null, true],
		["project_admin", "项目管理员", "owner", true],
		["project_admin", "项目管理员", "member", false],
		["project_admin", "项目管理员", null, false],
		["member", "普通用户（项目 owner 记录保留，管理权限暂停）", "owner", false],
		["member", "普通用户", "member", false],
		["member", "普通用户", null, false],
	] as const)(
		"%s（%s）+ 项目角色 %s：%s",
		(platformRole, _label, projectRole, expected) => {
			expect(canAdministerProject({ platformRole, projectRole })).toBe(
				expected
			);
		}
	);

	it("能管理的一定能进入（反过来不成立）", () => {
		for (const access of [
			memberOfProject,
			ownerOfProject,
			strangerToProject,
			adminOutsideProject,
			adminMemberOfProject,
			adminOwnerOfProject,
			projectAdminOwnerOfProject,
		]) {
			if (canAdministerProject(access)) {
				expect(canEnterProject(access)).toBe(true);
			}
		}
	});
});

describe("isProjectOwnerSuspended：项目 owner 的管理权限是否暂停", () => {
	it.each([
		["owner", "admin", "平台管理员", false],
		["owner", "project_admin", "项目管理员", false],
		["owner", "member", "普通用户", true],
		["member", "admin", "平台管理员", false],
		["member", "project_admin", "项目管理员", false],
		["member", "member", "普通用户", false],
		[null, "member", "普通用户", false],
	] as const)(
		"项目角色 %s + %s（%s）：%s",
		(projectRole, platformRole, _label, expected) => {
			expect(isProjectOwnerSuspended(projectRole, platformRole)).toBe(expected);
		}
	);
});

describe("按平台角色判断：成为项目 owner、新建项目、projects.list 要不要过滤", () => {
	it.each([
		["admin", "平台管理员", true, true],
		["project_admin", "项目管理员", true, false],
		["member", "普通用户", false, false],
	] as const)(
		"%s（%s）：能成为 owner 与能新建项目都是 %s；看全部项目是 %s",
		(platformRole, _label, canOwnAndCreate, seesAll) => {
			expect(canBecomeProjectOwner(platformRole)).toBe(canOwnAndCreate);
			expect(canCreateProject(platformRole)).toBe(canOwnAndCreate);
			// 看不到全部项目的角色只看自己所属的——list 因此必须走 listProjectsByMember
			expect(seesAllProjects(platformRole)).toBe(seesAll);
		}
	);
});
