import type { User, UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../auth/settings-fixtures";
import { callContext, testUser } from "../test-fixtures";
import { usersRouter } from "./users";

const mocks = vi.hoisted(() => ({
	countLocalLoginAdmins: vi.fn(),
	createUser: vi.fn(),
	getUserById: vi.fn(),
	removeProjectMember: vi.fn(),
	setUserDisabled: vi.fn(),
	updateProjectMemberRole: vi.fn(),
	updateUserRole: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/users-repository", () => ({
	countLocalLoginAdmins: mocks.countLocalLoginAdmins,
	createUser: mocks.createUser,
	getUserById: mocks.getUserById,
	listUsers: vi.fn(),
	listUsersWithProjects: vi.fn(),
	setUserDisabled: mocks.setUserDisabled,
	updateUserPasswordHash: vi.fn(),
	updateUserRole: mocks.updateUserRole,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
	removeProjectMember: mocks.removeProjectMember,
	updateProjectMemberRole: mocks.updateProjectMemberRole,
}));
vi.mock("@automationstack/db/password", () => ({
	hashPassword: vi.fn((password: string) =>
		Promise.resolve(`hash:${password}`)
	),
	MAX_PASSWORD_LENGTH: 128,
	MIN_PASSWORD_LENGTH: 8,
}));
vi.mock("../auth/settings-store", () => ({
	getEffectiveAuthSettings: () =>
		Promise.resolve(effectiveSettings({ provider: "local" })),
}));

const actingAdmin = testUser();
const localUser = testUser({
	id: "22222222-2222-4222-8222-222222222222",
	role: "member",
	username: "bob",
});
const context = callContext(actingAdmin);

const PLATFORM_ROLES = [
	["admin", "平台管理员"],
	["project_admin", "项目管理员"],
	["member", "普通用户"],
] as const;

function createWithRole(role: UserRole) {
	return call(
		usersRouter.create,
		{ password: "password-1", role, username: "newbie" },
		{ context, path: ["users", "create"] }
	);
}

function setRole(id: string, role: UserRole) {
	return call(
		usersRouter.setRole,
		{ id, role },
		{ context, path: ["users", "setRole"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.countLocalLoginAdmins.mockResolvedValue(2);
	mocks.getUserById.mockResolvedValue(localUser);
	mocks.createUser.mockImplementation((input: { role: UserRole }) =>
		Promise.resolve({ ...localUser, role: input.role })
	);
	mocks.updateUserRole.mockImplementation((_id: string, role: UserRole) =>
		Promise.resolve({ ...localUser, role })
	);
});

describe("users.create：新建内置认证用户时可以选择三个平台角色", () => {
	it.each(PLATFORM_ROLES)("%s（%s）", async (role, _label) => {
		await expect(createWithRole(role)).resolves.toMatchObject({ role });
		expect(mocks.createUser).toHaveBeenCalledWith(
			expect.objectContaining({ role, username: "newbie" })
		);
	});

	it("不选平台角色：默认为普通用户（member）", async () => {
		await call(
			usersRouter.create,
			{ password: "password-1", username: "newbie" },
			{ context, path: ["users", "create"] }
		);
		expect(mocks.createUser).toHaveBeenCalledWith(
			expect.objectContaining({ role: "member" })
		);
	});

	it("不认识的平台角色：BAD_REQUEST，不写数据库", async () => {
		await expect(
			createWithRole("owner" as unknown as UserRole)
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createUser).not.toHaveBeenCalled();
	});
});

describe("users.setRole：内置认证用户可以设为三个平台角色", () => {
	it.each(PLATFORM_ROLES)("%s（%s）", async (role, _label) => {
		await expect(setRole(localUser.id, role)).resolves.toMatchObject({
			role,
		});
		expect(mocks.updateUserRole).toHaveBeenCalledWith(localUser.id, role);
	});
});

describe("users.setRole：降级为项目管理员时，原有保护仍然有效", () => {
	it("不能把自己降级为项目管理员", async () => {
		mocks.getUserById.mockResolvedValue(actingAdmin);
		await expect(
			setRole(actingAdmin.id, "project_admin")
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "不能取消自己的平台管理员身份",
		});
		expect(mocks.updateUserRole).not.toHaveBeenCalled();
	});

	it("不能把最后一个可以内置登录的平台管理员降级为项目管理员", async () => {
		const lastAdmin: User = { ...localUser, role: "admin" };
		mocks.getUserById.mockResolvedValue(lastAdmin);
		mocks.countLocalLoginAdmins.mockResolvedValue(1);
		await expect(setRole(lastAdmin.id, "project_admin")).rejects.toMatchObject({
			code: "CONFLICT",
			message: "不能降级最后一个平台管理员",
		});
		expect(mocks.updateUserRole).not.toHaveBeenCalled();
	});

	it("还有其他平台管理员：可以降级为项目管理员", async () => {
		mocks.getUserById.mockResolvedValue({ ...localUser, role: "admin" });
		await expect(setRole(localUser.id, "project_admin")).resolves.toMatchObject(
			{ role: "project_admin" }
		);
	});
});

describe("users.setRole：项目管理员降级为普通用户", () => {
	it("只修改平台角色，不修改项目成员记录（项目 owner 记录保留）", async () => {
		mocks.getUserById.mockResolvedValue({
			...localUser,
			role: "project_admin",
		});
		await expect(setRole(localUser.id, "member")).resolves.toMatchObject({
			role: "member",
		});
		expect(mocks.updateUserRole).toHaveBeenCalledWith(localUser.id, "member");
		expect(mocks.updateProjectMemberRole).not.toHaveBeenCalled();
		expect(mocks.removeProjectMember).not.toHaveBeenCalled();
	});
});

describe("非平台管理员不能管理用户", () => {
	it.each([
		["project_admin", "项目管理员"],
		["member", "普通用户"],
	] as const)("%s（%s）：FORBIDDEN，不写数据库", async (role, _label) => {
		const caller = callContext({ ...actingAdmin, role });
		await expect(
			call(
				usersRouter.setRole,
				{ id: localUser.id, role: "admin" },
				{ context: caller, path: ["users", "setRole"] }
			)
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.updateUserRole).not.toHaveBeenCalled();
	});
});
