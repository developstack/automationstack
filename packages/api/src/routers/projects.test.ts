import type { Project } from "@automationstack/db/schema/projects";
import type { UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { projectsRouter } from "./projects";

const mocks = vi.hoisted(() => ({
	createProjectWithCreator: vi.fn(),
	isProjectMember: vi.fn(),
	listProjects: vi.fn(),
	listProjectsByMember: vi.fn(),
	publishInvalidate: vi.fn(),
	updateProject: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	createProjectWithCreator: mocks.createProjectWithCreator,
	isProjectMember: mocks.isProjectMember,
	listProjectsByMember: mocks.listProjectsByMember,
}));
vi.mock("@automationstack/db/repositories/projects-repository", () => ({
	getProjectById: vi.fn(),
	listProjects: mocks.listProjects,
	removeProject: vi.fn(),
	updateProject: mocks.updateProject,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const baseUser = testUser({ role: "member", username: "alice" });

const project: Project = {
	createdAt: new Date("2026-01-01T00:00:00Z"),
	description: null,
	id: "55555555-5555-4555-8555-555555555555",
	name: "登录模块",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const allProjects = [project, { ...project, id: "other", name: "别人的项目" }];
const joinedProjects = [project];

function contextFor(role: UserRole) {
	return callContext({ ...baseUser, role });
}

function createAs(role: UserRole) {
	return call(
		projectsRouter.create,
		{ name: "登录模块" },
		{ context: contextFor(role), path: ["projects", "create"] }
	);
}

function listAs(role: UserRole) {
	return call(projectsRouter.list, undefined, {
		context: contextFor(role),
		path: ["projects", "list"],
	});
}

function renameAs(platformRole: UserRole, isMember: boolean) {
	mocks.isProjectMember.mockResolvedValue(isMember);
	return call(
		projectsRouter.update,
		{ id: project.id, name: "新名字" },
		{ context: contextFor(platformRole), path: ["projects", "update"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.createProjectWithCreator.mockResolvedValue(project);
	mocks.listProjects.mockResolvedValue(allProjects);
	mocks.listProjectsByMember.mockResolvedValue(joinedProjects);
	mocks.updateProject.mockResolvedValue(project);
});

describe("projects.create：只有管理员可以新建项目", () => {
	it("admin（管理员）：新建成功，并成为项目成员", async () => {
		await expect(createAs("admin")).resolves.toEqual(project);
		expect(mocks.createProjectWithCreator).toHaveBeenCalledWith(
			{ description: undefined, name: "登录模块" },
			baseUser.id
		);
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(1);
	});

	it("member（普通用户）：FORBIDDEN，中文说明，不写数据库", async () => {
		await expect(createAs("member")).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "只有管理员可以新建项目",
		});
		expect(mocks.createProjectWithCreator).not.toHaveBeenCalled();
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});
});

describe("projects.list：管理员看到所有项目，普通用户只看到自己加入的项目", () => {
	it("admin（管理员）：所有项目", async () => {
		await expect(listAs("admin")).resolves.toEqual(allProjects);
		expect(mocks.listProjectsByMember).not.toHaveBeenCalled();
	});

	it("member（普通用户）：只有自己加入的项目", async () => {
		await expect(listAs("member")).resolves.toEqual(joinedProjects);
		expect(mocks.listProjectsByMember).toHaveBeenCalledWith(baseUser.id);
		expect(mocks.listProjects).not.toHaveBeenCalled();
	});
});

describe("projects.update：只有管理员可以修改项目", () => {
	it.each([
		[false, "不是成员"],
		[true, "是成员"],
	] as const)("管理员（%s，%s）：可以修改", async (isMember, _label) => {
		await expect(renameAs("admin", isMember)).resolves.toEqual(project);
		expect(mocks.updateProject).toHaveBeenCalledTimes(1);
	});

	it("项目成员中的普通用户：FORBIDDEN，不写数据库", async () => {
		await expect(renameAs("member", true)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.updateProject).not.toHaveBeenCalled();
	});
});
