import type { UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { projectMembersRouter } from "./project-members";

const mocks = vi.hoisted(() => ({
	addProjectMember: vi.fn(),
	getUserById: vi.fn(),
	isProjectMember: vi.fn(),
	listProjectMemberCandidates: vi.fn(),
	publishMembershipRevoked: vi.fn(),
	removeProjectMember: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	addProjectMember: mocks.addProjectMember,
	isProjectMember: mocks.isProjectMember,
	listProjectMemberCandidates: mocks.listProjectMemberCandidates,
	listProjectMembers: vi.fn(),
	removeProjectMember: mocks.removeProjectMember,
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserById: mocks.getUserById,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishMembershipRevoked: mocks.publishMembershipRevoked,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_REQUIRED = "只有管理员能管理项目成员";

const caller = testUser({ username: "alice" });
const target = testUser({
	id: "22222222-2222-4222-8222-222222222222",
	role: "member",
	username: "bob",
});

/** 调用者的平台角色，以及他是否是本项目的成员。 */
function contextFor(platformRole: UserRole, isMember: boolean) {
	mocks.isProjectMember.mockResolvedValue(isMember);
	return callContext({ ...caller, role: platformRole });
}

type Procedure = "add" | "listCandidates" | "remove";

function callAs(
	procedure: Procedure,
	platformRole: UserRole,
	isMember: boolean,
	userId = target.id
) {
	const input =
		procedure === "listCandidates"
			? { projectId: PROJECT_ID }
			: { projectId: PROJECT_ID, userId };
	return call(
		projectMembersRouter[procedure] as typeof projectMembersRouter.remove,
		input as { projectId: string; userId: string },
		{
			context: contextFor(platformRole, isMember),
			path: ["projectMembers", procedure],
		}
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUserById.mockResolvedValue(target);
	mocks.addProjectMember.mockImplementation(
		(input: { projectId: string; userId: string }) => Promise.resolve(input)
	);
	mocks.listProjectMemberCandidates.mockResolvedValue([]);
	mocks.removeProjectMember.mockResolvedValue(true);
});

describe("只有管理员能管理项目成员", () => {
	it.each<Procedure>(["add", "listCandidates", "remove"])(
		"%s：项目成员中的普通用户 FORBIDDEN，不写数据库",
		async (procedure) => {
			await expect(callAs(procedure, "member", true)).rejects.toMatchObject({
				code: "FORBIDDEN",
				message: ADMIN_REQUIRED,
			});
			expect(mocks.addProjectMember).not.toHaveBeenCalled();
			expect(mocks.removeProjectMember).not.toHaveBeenCalled();
		}
	);

	it.each<Procedure>(["add", "listCandidates", "remove"])(
		"%s：不是成员的普通用户进不了项目，FORBIDDEN",
		async (procedure) => {
			await expect(callAs(procedure, "member", false)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		}
	);

	it("管理员即使不是项目成员，也能列出候选人", async () => {
		await expect(callAs("listCandidates", "admin", false)).resolves.toEqual([]);
		expect(mocks.listProjectMemberCandidates).toHaveBeenCalledWith(PROJECT_ID);
	});
});

describe("projectMembers.add", () => {
	it("管理员添加成员：成功", async () => {
		await expect(callAs("add", "admin", false)).resolves.toEqual({
			projectId: PROJECT_ID,
			userId: target.id,
		});
		expect(mocks.addProjectMember).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			userId: target.id,
		});
	});

	it("用户不存在：NOT_FOUND，不写数据库", async () => {
		mocks.getUserById.mockResolvedValue(null);
		await expect(callAs("add", "admin", true)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.addProjectMember).not.toHaveBeenCalled();
	});

	it("已经是项目成员：CONFLICT", async () => {
		mocks.addProjectMember.mockResolvedValue(null);
		await expect(callAs("add", "admin", true)).rejects.toMatchObject({
			code: "CONFLICT",
			message: "该用户已经是项目成员",
		});
	});
});

describe("projectMembers.remove", () => {
	it("管理员移除成员：成功，并通知被移除的人", async () => {
		await expect(callAs("remove", "admin", true)).resolves.toEqual({
			projectId: PROJECT_ID,
			userId: target.id,
		});
		expect(mocks.publishMembershipRevoked).toHaveBeenCalledWith(
			PROJECT_ID,
			target.id
		);
	});

	it("不能把自己移出项目：BAD_REQUEST，不写数据库", async () => {
		await expect(
			callAs("remove", "admin", true, caller.id)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "不能把自己移出项目",
		});
		expect(mocks.removeProjectMember).not.toHaveBeenCalled();
	});

	it("不是项目成员：NOT_FOUND，不通知", async () => {
		mocks.removeProjectMember.mockResolvedValue(false);
		await expect(callAs("remove", "admin", true)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.publishMembershipRevoked).not.toHaveBeenCalled();
	});
});
