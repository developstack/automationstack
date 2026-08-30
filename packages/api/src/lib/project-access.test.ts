/**
 * 项目级授权的规则表。
 *
 * 这是本仓库第一份授权逻辑，而授权逻辑的失效方式是「多放行了一个人」——
 * 既不抛异常也不让 tsc 变红，没有测试就没有任何东西会报警。所以这里把三条
 * 规则的**全部**输入组合逐一钉死（平台角色 2 档 × 项目角色 3 种取值），
 * 而不是只测几个代表点：组合总共 6 种，与其挑代表不如全列出来，
 * 将来谁加了第三档角色，缺哪一格一眼就看得见。
 */
import { describe, expect, it } from "vitest";

import {
	canAdministerProject,
	canEnterProject,
	type ProjectAccess,
	seesAllProjects,
} from "./project-access";

/** 平台 member（绝大多数人）在项目里的三种可能处境。 */
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

/** 同样三种处境，但人是平台 admin。 */
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

	it("普通用户只看自己所属的——list 因此必须走 listProjectsByMember", () => {
		expect(seesAllProjects("member")).toBe(false);
	});
});
