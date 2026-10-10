import type { Project } from "@automationstack/db/schema/projects";
import type { User, UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectsRouter } from "./projects";

const mocks = vi.hoisted(() => ({
	createProjectWithOwner: vi.fn(),
	listProjects: vi.fn(),
	listProjectsByMember: vi.fn(),
	publishInvalidate: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	createProjectWithOwner: mocks.createProjectWithOwner,
	getProjectRole: vi.fn(),
	listProjectsByMember: mocks.listProjectsByMember,
}));
vi.mock("@automationstack/db/repositories/projects-repository", () => ({
	getProjectById: vi.fn(),
	listProjects: mocks.listProjects,
	removeProject: vi.fn(),
	updateProject: vi.fn(),
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const baseUser: User = {
	authSource: "local",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	externalId: null,
	id: "11111111-1111-4111-8111-111111111111",
	mustChangePassword: false,
	passwordHash: "hash",
	role: "member",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	username: "alice",
};

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
	const user: User = { ...baseUser, role };
	return {
		actor: { clientId: "t", name: user.username },
		cookies: [] as string[],
		secure: false,
		user,
	};
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

beforeEach(() => {
	vi.clearAllMocks();
	mocks.createProjectWithOwner.mockResolvedValue(project);
	mocks.listProjects.mockResolvedValue(allProjects);
	mocks.listProjectsByMember.mockResolvedValue(joinedProjects);
});

describe("projects.create：只有平台管理员和项目管理员可以新建项目", () => {
	it.each([
		["admin", "平台管理员"],
		["project_admin", "项目管理员"],
	] as const)("%s（%s）：新建成功，并成为项目 owner", async (role, _label) => {
		await expect(createAs(role)).resolves.toEqual(project);
		expect(mocks.createProjectWithOwner).toHaveBeenCalledWith(
			{ description: undefined, name: "登录模块" },
			baseUser.id
		);
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(1);
	});

	it("member（普通用户）：FORBIDDEN，中文说明，不写数据库", async () => {
		await expect(createAs("member")).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "只有平台管理员和项目管理员可以新建项目",
		});
		expect(mocks.createProjectWithOwner).not.toHaveBeenCalled();
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});
});

describe("projects.list：平台管理员看到所有项目，其他人只看到自己加入的项目", () => {
	it("admin（平台管理员）：所有项目", async () => {
		await expect(listAs("admin")).resolves.toEqual(allProjects);
		expect(mocks.listProjectsByMember).not.toHaveBeenCalled();
	});

	it.each([
		["project_admin", "项目管理员"],
		["member", "普通用户"],
	] as const)("%s（%s）：只有自己加入的项目", async (role, _label) => {
		await expect(listAs(role)).resolves.toEqual(joinedProjects);
		expect(mocks.listProjectsByMember).toHaveBeenCalledWith(baseUser.id);
		expect(mocks.listProjects).not.toHaveBeenCalled();
	});
});
