import type { UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	CASDOOR_MANAGED_USER_MESSAGE,
	CASDOOR_NO_LOCAL_PASSWORD_MESSAGE,
} from "../auth/casdoor/managed-users";
import { effectiveSettings } from "../auth/settings-fixtures";
import { callContext, testUser } from "../test-fixtures";
import { usersRouter } from "./users";

const mocks = vi.hoisted(() => ({
	countLocalLoginAdmins: vi.fn(),
	createUser: vi.fn(),
	getEffectiveAuthSettings: vi.fn(),
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
	getProjectRole: vi.fn(),
}));
vi.mock("@automationstack/db/password", () => ({
	hashPassword: vi.fn((password: string) =>
		Promise.resolve(`hash:${password}`)
	),
	MAX_PASSWORD_LENGTH: 128,
	MIN_PASSWORD_LENGTH: 8,
}));
vi.mock("../auth/settings-store", () => ({
	getEffectiveAuthSettings: mocks.getEffectiveAuthSettings,
}));

const actingAdmin = testUser();
const casdoorUser = testUser({
	authSource: "casdoor",
	externalId: "ext-1",
	id: "33333333-3333-4333-8333-333333333333",
	passwordHash: null,
	role: "member",
	username: "alice",
});
const context = callContext(actingAdmin);

const ID = casdoorUser.id;

/** mutations 中同一接口的不同输入用后缀区分，例如 setRoleAdmin。 */
const VARIANT_SUFFIX = /(True|False|ProjectAdmin|Admin|Member)$/;

const options = (name: string) => ({ context, path: ["users", name] });
const setDisabled = (disabled: boolean) => () =>
	call(usersRouter.setDisabled, { disabled, id: ID }, options("setDisabled"));
const setRole = (role: UserRole) => () =>
	call(usersRouter.setRole, { id: ID, role }, options("setRole"));

/** 修改用户的全部接口。新增修改用户的接口时，必须加到这里（plan 021 T12）。 */
const mutations = {
	create: () =>
		call(
			usersRouter.create,
			{ password: "password-1", role: "admin", username: "newbie" },
			options("create")
		),
	resetPassword: () =>
		call(
			usersRouter.resetPassword,
			{ id: ID, password: "password-1" },
			options("resetPassword")
		),
	setDisabledFalse: setDisabled(false),
	setDisabledTrue: setDisabled(true),
	setRoleAdmin: setRole("admin"),
	setRoleMember: setRole("member"),
	setRoleProjectAdmin: setRole("project_admin"),
};

function expectNoWrites() {
	for (const write of [
		mocks.createUser,
		mocks.setUserDisabled,
		mocks.updateUserPasswordHash,
		mocks.updateUserRole,
	]) {
		expect(write).not.toHaveBeenCalled();
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getEffectiveAuthSettings.mockResolvedValue(
		effectiveSettings({ provider: "casdoor" })
	);
	mocks.getUserById.mockResolvedValue(casdoorUser);
	mocks.countLocalLoginAdmins.mockResolvedValue(2);
	mocks.createUser.mockResolvedValue(casdoorUser);
	mocks.updateUserRole.mockResolvedValue(casdoorUser);
	mocks.setUserDisabled.mockResolvedValue(casdoorUser);
	mocks.updateUserPasswordHash.mockResolvedValue(true);
});

/** 每个接口拒绝 Casdoor 用户时的错误信息。 */
const expectedMessage: Record<string, string> = {
	resetPassword: CASDOOR_NO_LOCAL_PASSWORD_MESSAGE,
	setDisabledFalse: CASDOOR_MANAGED_USER_MESSAGE,
	setDisabledTrue: CASDOOR_MANAGED_USER_MESSAGE,
	setRoleAdmin: CASDOOR_MANAGED_USER_MESSAGE,
	setRoleMember: CASDOOR_MANAGED_USER_MESSAGE,
	setRoleProjectAdmin: CASDOOR_MANAGED_USER_MESSAGE,
};

describe("casdoor 模式：没有接口可以修改 Casdoor 用户（T12）", () => {
	for (const [name, mutate] of Object.entries(mutations)) {
		it(`users.${name}：FORBIDDEN，不写数据库`, async () => {
			await expect(mutate()).rejects.toMatchObject({ code: "FORBIDDEN" });
			expectNoWrites();
		});
	}

	it("users 路由中每个修改接口都在上面的列表中", () => {
		const readOnly = new Set(["list", "listWithProjects"]);
		const covered = new Set(
			Object.keys(mutations).map((name) => name.replace(VARIANT_SUFFIX, ""))
		);
		const writers = Object.keys(usersRouter).filter(
			(name) => !readOnly.has(name)
		);
		expect(writers.filter((name) => !covered.has(name))).toEqual([]);
	});

	it("创建用户被拒绝时的错误信息", async () => {
		await expect(mutations.create()).rejects.toMatchObject({
			message: expect.stringContaining("Casdoor 中管理"),
		});
	});

	it("本地用户仍然可以修改", async () => {
		mocks.getUserById.mockResolvedValue({
			...casdoorUser,
			authSource: "local",
			passwordHash: "hash",
		});
		mocks.updateUserRole.mockResolvedValue({
			...casdoorUser,
			authSource: "local",
			role: "admin",
		});
		await expect(mutations.setRoleAdmin()).resolves.toMatchObject({
			role: "admin",
		});
	});
});

describe("任何模式：Casdoor 用户的密码、角色和禁用状态都不能在本系统中修改（§2 第 12 项）", () => {
	for (const provider of ["casdoor", "local"] as const) {
		for (const [name, message] of Object.entries(expectedMessage)) {
			it(`${provider} 模式，users.${name}：FORBIDDEN「${message}」，不写数据库`, async () => {
				mocks.getEffectiveAuthSettings.mockResolvedValue(
					effectiveSettings({ provider })
				);
				const mutate = mutations[name as keyof typeof mutations];
				await expect(mutate()).rejects.toMatchObject({
					code: "FORBIDDEN",
					message,
				});
				expectNoWrites();
			});
		}
	}
});

describe("local 模式：可以创建用户", () => {
	it("创建用户", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ provider: "local" })
		);
		await expect(mutations.create()).resolves.toBeDefined();
	});
});

describe("最后一个管理员的检查只计算本地管理员（T12）", () => {
	const localAdmin = testUser({
		id: "44444444-4444-4444-8444-444444444444",
		username: "admin2",
	});

	it("只剩一个本地登录管理员：不能降级，也不能停用", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ provider: "local" })
		);
		mocks.getUserById.mockResolvedValue(localAdmin);
		mocks.countLocalLoginAdmins.mockResolvedValue(1);
		await expect(mutations.setRoleMember()).rejects.toMatchObject({
			code: "CONFLICT",
		});
		await expect(mutations.setDisabledTrue()).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("没有本地密码的管理员不计入：降级不受限制", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ provider: "local" })
		);
		mocks.getUserById.mockResolvedValue({ ...localAdmin, passwordHash: null });
		mocks.countLocalLoginAdmins.mockResolvedValue(1);
		await expect(mutations.setRoleMember()).resolves.toBeDefined();
		expect(mocks.countLocalLoginAdmins).not.toHaveBeenCalled();
	});
});
