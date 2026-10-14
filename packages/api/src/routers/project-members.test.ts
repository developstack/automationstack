import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { projectMembersRouter } from "./project-members";

const mocks = vi.hoisted(() => ({
	addProjectMember: vi.fn(),
	countProjectOwners: vi.fn(),
	getProjectRole: vi.fn(),
	getUserById: vi.fn(),
	listProjectMemberCandidates: vi.fn(),
	publishMembershipRevoked: vi.fn(),
	removeProjectMember: vi.fn(),
	updateProjectMemberRole: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	addProjectMember: mocks.addProjectMember,
	countProjectOwners: mocks.countProjectOwners,
	getProjectRole: mocks.getProjectRole,
	listProjectMemberCandidates: mocks.listProjectMemberCandidates,
	listProjectMembers: vi.fn(),
	removeProjectMember: mocks.removeProjectMember,
	updateProjectMemberRole: mocks.updateProjectMemberRole,
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserById: mocks.getUserById,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishMembershipRevoked: mocks.publishMembershipRevoked,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const OWNER_NOT_ELIGIBLE = "只有平台管理员和项目管理员可以成为项目 owner";
const OWNER_REQUIRED = "只有平台管理员和身为项目 owner 的项目管理员能管理成员";

const caller = testUser({ role: "project_admin", username: "alice" });
const target = testUser({
	id: "22222222-2222-4222-8222-222222222222",
	role: "member",
	username: "bob",
});

/** 被操作用户在本项目里的项目角色。 */
let targetProjectRole: ProjectRole = "member";

/** 调用者的平台角色，和他在本项目里的项目角色（null 表示不是项目成员）。 */
function contextFor(platformRole: UserRole, projectRole: ProjectRole | null) {
	mocks.getProjectRole.mockImplementation(
		(_projectId: string, userId: string) =>
			Promise.resolve(userId === caller.id ? projectRole : targetProjectRole)
	);
	return callContext({ ...caller, role: platformRole });
}

function addAs(
	platformRole: UserRole,
	projectRole: ProjectRole | null,
	role: ProjectRole
) {
	return call(
		projectMembersRouter.add,
		{ projectId: PROJECT_ID, role, userId: target.id },
		{
			context: contextFor(platformRole, projectRole),
			path: ["projectMembers", "add"],
		}
	);
}

function updateRoleAs(
	platformRole: UserRole,
	projectRole: ProjectRole | null,
	role: ProjectRole
) {
	return call(
		projectMembersRouter.updateRole,
		{ projectId: PROJECT_ID, role, userId: target.id },
		{
			context: contextFor(platformRole, projectRole),
			path: ["projectMembers", "updateRole"],
		}
	);
}

function removeAs(platformRole: UserRole, projectRole: ProjectRole | null) {
	return call(
		projectMembersRouter.remove,
		{ projectId: PROJECT_ID, userId: target.id },
		{
			context: contextFor(platformRole, projectRole),
			path: ["projectMembers", "remove"],
		}
	);
}

function targetIs(platformRole: UserRole) {
	mocks.getUserById.mockResolvedValue({ ...target, role: platformRole });
}

beforeEach(() => {
	vi.clearAllMocks();
	targetProjectRole = "member";
	targetIs("member");
	mocks.countProjectOwners.mockResolvedValue(2);
	mocks.addProjectMember.mockImplementation(
		(input: { role: ProjectRole; userId: string }) =>
			Promise.resolve({ projectId: PROJECT_ID, ...input })
	);
	mocks.updateProjectMemberRole.mockImplementation(
		(projectId: string, userId: string, role: ProjectRole) =>
			Promise.resolve({ projectId, role, userId })
	);
	mocks.removeProjectMember.mockResolvedValue(true);
});

describe("项目管理员可以管理自己是项目 owner 的项目，不能管理其他项目", () => {
	it("项目 owner：可以添加项目成员", async () => {
		await expect(addAs("project_admin", "owner", "member")).resolves.toEqual(
			expect.objectContaining({ role: "member", userId: target.id })
		);
	});

	it.each([
		["项目成员", "member", { code: "FORBIDDEN", message: OWNER_REQUIRED }],
		["不是项目成员", null, { code: "FORBIDDEN" }],
	] as const)(
		"%s：FORBIDDEN，不写数据库",
		async (_name, projectRole, error) => {
			await expect(
				addAs("project_admin", projectRole, "member")
			).rejects.toMatchObject(error);
			expect(mocks.addProjectMember).not.toHaveBeenCalled();
		}
	);
});

describe("不能把普通用户设为项目 owner：BAD_REQUEST，中文说明，不写数据库", () => {
	it.each([
		[
			"项目管理员调用 projectMembers.add",
			() => addAs("project_admin", "owner", "owner"),
			mocks.addProjectMember,
		],
		[
			"项目管理员调用 projectMembers.updateRole",
			() => updateRoleAs("project_admin", "owner", "owner"),
			mocks.updateProjectMemberRole,
		],
		[
			"平台管理员操作时同样拒绝",
			() => addAs("admin", null, "owner"),
			mocks.addProjectMember,
		],
	])("%s", async (_name, invoke, write) => {
		await expect(invoke()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: OWNER_NOT_ELIGIBLE,
		});
		expect(write).not.toHaveBeenCalled();
	});
});

describe("可以把项目管理员和平台管理员设为项目 owner", () => {
	it.each([
		["project_admin", "项目管理员"],
		["admin", "平台管理员"],
	] as const)("%s（%s）：add 和 updateRole 都成功", async (role, _label) => {
		targetIs(role);
		await expect(addAs("project_admin", "owner", "owner")).resolves.toEqual(
			expect.objectContaining({ role: "owner", userId: target.id })
		);
		await expect(
			updateRoleAs("project_admin", "owner", "owner")
		).resolves.toEqual(expect.objectContaining({ role: "owner" }));
		expect(mocks.updateProjectMemberRole).toHaveBeenCalledWith(
			PROJECT_ID,
			target.id,
			"owner"
		);
	});
});

describe("项目管理员降级为普通用户后暂停管理，恢复角色后自动恢复", () => {
	it("降级后：项目 owner 记录还在，但不能管理该项目", async () => {
		await expect(addAs("member", "owner", "member")).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: OWNER_REQUIRED,
		});
		await expect(removeAs("member", "owner")).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			call(
				projectMembersRouter.listCandidates,
				{ projectId: PROJECT_ID },
				{
					context: contextFor("member", "owner"),
					path: ["projectMembers", "listCandidates"],
				}
			)
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.removeProjectMember).not.toHaveBeenCalled();
	});

	it("恢复为项目管理员后：同一条项目 owner 记录重新可以管理", async () => {
		await expect(removeAs("project_admin", "owner")).resolves.toEqual({
			projectId: PROJECT_ID,
			userId: target.id,
		});
		expect(mocks.removeProjectMember).toHaveBeenCalledWith(
			PROJECT_ID,
			target.id
		);
	});
});

describe("项目只剩被暂停权限的项目 owner 时，平台管理员仍可以管理", () => {
	it("平台管理员不是项目成员，也可以添加项目成员", async () => {
		await expect(addAs("admin", null, "member")).resolves.toEqual(
			expect.objectContaining({ role: "member" })
		);
	});

	it("平台管理员可以把项目管理员设为新的项目 owner", async () => {
		targetIs("project_admin");
		await expect(updateRoleAs("admin", null, "owner")).resolves.toEqual(
			expect.objectContaining({ role: "owner" })
		);
	});

	it("现有保护不变：不能降级项目的最后一个 owner", async () => {
		targetProjectRole = "owner";
		mocks.countProjectOwners.mockResolvedValue(1);
		await expect(updateRoleAs("admin", null, "member")).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "不能降级项目的最后一个 owner",
		});
		expect(mocks.updateProjectMemberRole).not.toHaveBeenCalled();
	});
});
