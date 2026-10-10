import { describe, expect, it } from "vitest";

import {
	canAdministerProject,
	canCreateProject,
	canEnterProject,
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
	it("项目成员能进（owner 与 member 无差别）", () => {
		expect(canEnterProject(memberOfProject)).toBe(true);
		expect(canEnterProject(ownerOfProject)).toBe(true);
	});

	it("不是成员的普通用户进不去——这条一旦失效，等于全仓没有项目级授权", () => {
		expect(canEnterProject(strangerToProject)).toBe(false);
	});

	it("平台 admin 即使没有成员记录也能进", () => {
		expect(canEnterProject(adminOutsideProject)).toBe(true);
		expect(canEnterProject(adminMemberOfProject)).toBe(true);
		expect(canEnterProject(adminOwnerOfProject)).toBe(true);
	});
});

describe("canAdministerProject：谁能改项目 / 删项目 / 管成员", () => {
	it("owner 可以", () => {
		expect(canAdministerProject(ownerOfProject)).toBe(true);
	});

	it("member 不可以——这就是两档项目角色唯一的区别", () => {
		expect(canAdministerProject(memberOfProject)).toBe(false);
	});

	it("不是成员的普通用户当然不可以", () => {
		expect(canAdministerProject(strangerToProject)).toBe(false);
	});

	it("平台 admin 可以，哪怕他在项目里只是 member 或压根不是成员", () => {
		expect(canAdministerProject(adminOutsideProject)).toBe(true);
		expect(canAdministerProject(adminMemberOfProject)).toBe(true);
		expect(canAdministerProject(adminOwnerOfProject)).toBe(true);
	});

	it("能管理的一定能进入（反过来不成立）", () => {
		for (const access of [
			memberOfProject,
			ownerOfProject,
			strangerToProject,
			adminOutsideProject,
			adminMemberOfProject,
			adminOwnerOfProject,
		]) {
			if (canAdministerProject(access)) {
				expect(canEnterProject(access)).toBe(true);
			}
		}
	});
});

describe("seesAllProjects：projects.list 要不要过滤", () => {
	it("平台 admin 看全部项目", () => {
		expect(seesAllProjects("admin")).toBe(true);
	});

	it("项目管理员和普通用户只看自己所属的——list 因此必须走 listProjectsByMember", () => {
		expect(seesAllProjects("project_admin")).toBe(false);
		expect(seesAllProjects("member")).toBe(false);
	});
});

describe("canCreateProject：谁能新建项目", () => {
	it.each([
		["admin", "平台管理员", true],
		["project_admin", "项目管理员", true],
		["member", "普通用户", false],
	] as const)("%s（%s）：%s", (platformRole, _label, expected) => {
		expect(canCreateProject(platformRole)).toBe(expected);
	});
});
