import type { User, UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { usersRouter } from "./users";

const mocks = vi.hoisted(() => ({
	countLocalLoginAdmins: vi.fn(),
	createUser: vi.fn(),
	getUserById: vi.fn(),
	setUserDisabled: vi.fn(),
	updateUserPasswordHash: vi.fn(),
	updateUserRole: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/users-repository", () => ({
	countLocalLoginAdmins: mocks.countLocalLoginAdmins,
	createUser: mocks.createUser,
	getUserById: mocks.getUserById,
	listUsers: vi.fn(),
	listUsersWithProjects: vi.fn(),
	setUserDisabled: mocks.setUserDisabled,
	updateUserPasswordHash: mocks.updateUserPasswordHash,
	updateUserRole: mocks.updateUserRole,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: vi.fn(),
}));
vi.mock("@automationstack/db/password", () => ({
	hashPassword: vi.fn((password: string) =>
		Promise.resolve(`hash:${password}`)
	),
	MAX_PASSWORD_LENGTH: 128,
	MIN_PASSWORD_LENGTH: 8,
}));

const actingAdmin = testUser();
const localUser = testUser({
	id: "22222222-2222-4222-8222-222222222222",
	role: "member",
	username: "bob",
});
const context = callContext(actingAdmin);

const PLATFORM_ROLES = [
	["admin", "管理员"],
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
	mocks.setUserDisabled.mockImplementation((_id: string, disabled: boolean) =>
		Promise.resolve({ ...localUser, disabledAt: disabled ? new Date() : null })
	);
});

function setDisabled(id: string, disabled: boolean) {
	return call(
		usersRouter.setDisabled,
		{ disabled, id },
		{ context, path: ["users", "setDisabled"] }
	);
}

describe("users.create：新建用户时可以选择两个平台角色", () => {
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

describe("users.setRole：用户可以设为两个平台角色", () => {
	it.each(PLATFORM_ROLES)("%s（%s）", async (role, _label) => {
		await expect(setRole(localUser.id, role)).resolves.toMatchObject({
			role,
		});
		expect(mocks.updateUserRole).toHaveBeenCalledWith(localUser.id, role);
	});
});

describe("users.setRole 和 users.setDisabled：保护最后一个可以登录的管理员", () => {
	const lastAdmin: User = { ...localUser, role: "admin" };

	it("不能把自己降级为普通用户", async () => {
		mocks.getUserById.mockResolvedValue(actingAdmin);
		await expect(setRole(actingAdmin.id, "member")).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "不能取消自己的管理员身份",
		});
		expect(mocks.updateUserRole).not.toHaveBeenCalled();
	});

	it("不能停用自己的账号", async () => {
		mocks.getUserById.mockResolvedValue(actingAdmin);
		await expect(setDisabled(actingAdmin.id, true)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "不能停用自己的账号",
		});
		expect(mocks.setUserDisabled).not.toHaveBeenCalled();
	});

	it.each([
		["降级", () => setRole(lastAdmin.id, "member"), "不能降级最后一个管理员"],
		["停用", () => setDisabled(lastAdmin.id, true), "不能停用最后一个管理员"],
	])("只剩一个可以登录的管理员：不能%s", async (_name, act, message) => {
		mocks.getUserById.mockResolvedValue(lastAdmin);
		mocks.countLocalLoginAdmins.mockResolvedValue(1);
		await expect(act()).rejects.toMatchObject({ code: "CONFLICT", message });
		expect(mocks.updateUserRole).not.toHaveBeenCalled();
		expect(mocks.setUserDisabled).not.toHaveBeenCalled();
	});

	it("没有本地密码的管理员不计入：降级不受限制", async () => {
		mocks.getUserById.mockResolvedValue({ ...lastAdmin, passwordHash: null });
		mocks.countLocalLoginAdmins.mockResolvedValue(1);
		await expect(setRole(lastAdmin.id, "member")).resolves.toMatchObject({
			role: "member",
		});
	});

	it("还有其他管理员：可以停用，也可以恢复", async () => {
		mocks.getUserById.mockResolvedValue(lastAdmin);
		await expect(setDisabled(lastAdmin.id, true)).resolves.toMatchObject({
			disabledAt: expect.any(Date),
		});
		await expect(setDisabled(lastAdmin.id, false)).resolves.toMatchObject({
			disabledAt: null,
		});
	});
});

describe("users.resetPassword", () => {
	it("以前的 Casdoor 账号也可以重置密码，用户下次登录后必须修改密码", async () => {
		mocks.getUserById.mockResolvedValue({ ...localUser, passwordHash: null });
		await expect(
			call(
				usersRouter.resetPassword,
				{ id: localUser.id, password: "password-2" },
				{ context, path: ["users", "resetPassword"] }
			)
		).resolves.toEqual({ id: localUser.id });
		expect(mocks.updateUserPasswordHash).toHaveBeenCalledWith(
			localUser.id,
			"hash:password-2",
			true
		);
	});

	it("账号不存在：NOT_FOUND，不写数据库", async () => {
		mocks.getUserById.mockResolvedValue(null);
		await expect(
			call(
				usersRouter.resetPassword,
				{ id: localUser.id, password: "password-2" },
				{ context, path: ["users", "resetPassword"] }
			)
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});
});

describe("普通用户不能管理用户", () => {
	it("member（普通用户）：FORBIDDEN，不写数据库", async () => {
		const caller = callContext({ ...actingAdmin, role: "member" });
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
