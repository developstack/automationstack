import type { User } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoginRateLimitState } from "../lib/login-rate-limit";
import { callContext, testUser } from "../test-fixtures";
import { authRouter } from "./auth";

const mocks = vi.hoisted(() => ({
	getUserByUsername: vi.fn(),
	hashPassword: vi.fn((password: string) =>
		Promise.resolve(`hash:${password}`)
	),
	updateUserPasswordHash: vi.fn(),
	verifyPassword: vi.fn((password: string, stored: string) =>
		Promise.resolve(stored === `hash:${password}`)
	),
}));

vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserByUsername: mocks.getUserByUsername,
	updateUserPasswordHash: mocks.updateUserPasswordHash,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: vi.fn(),
}));
vi.mock("@automationstack/db/password", () => ({
	hashPassword: mocks.hashPassword,
	MAX_PASSWORD_LENGTH: 128,
	MIN_PASSWORD_LENGTH: 8,
	verifyPassword: mocks.verifyPassword,
}));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));

const STORED_PBKDF2_HASH = /^pbkdf2_sha256\$/;

const CURRENT = "current-password";
const NEXT = "next-password";

const user = testUser({
	mustChangePassword: true,
	passwordHash: `hash:${CURRENT}`,
});

/** 默认用正确的旧密码改成 NEXT。 */
function changePassword(
	input: { currentPassword?: string; newPassword?: string } = {},
	current: User = user
) {
	return call(
		authRouter.changePassword,
		{ currentPassword: CURRENT, newPassword: NEXT, ...input },
		{ context: callContext(current), path: ["auth", "changePassword"] }
	);
}

function login(username: string, password: string) {
	return call(
		authRouter.login,
		{ password, username },
		{ context: callContext(null), path: ["auth", "login"] }
	);
}

beforeEach(() => {
	resetLoginRateLimitState();
	mocks.getUserByUsername.mockReset();
	mocks.updateUserPasswordHash.mockReset();
	mocks.verifyPassword.mockClear();
	mocks.hashPassword.mockClear();
});

describe("auth.changePassword", () => {
	it("旧密码正确：保存新哈希，并清除 must_change_password", async () => {
		await expect(changePassword()).resolves.toEqual({ ok: true });
		expect(mocks.updateUserPasswordHash).toHaveBeenCalledWith(
			user.id,
			`hash:${NEXT}`,
			false
		);
	});

	it("旧密码错误：BAD_REQUEST（不是 UNAUTHORIZED），不修改密码", async () => {
		await expect(
			changePassword({ currentPassword: "wrong-pass" })
		).rejects.toMatchObject({ code: "BAD_REQUEST", message: "当前密码错误" });
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});

	it("连续输错旧密码会触发与登录相同的限流", async () => {
		const BACKOFF_AFTER_FAILURES = 5;
		for (let index = 0; index < BACKOFF_AFTER_FAILURES; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 限流按失败顺序计数，必须逐次执行
			await expect(
				changePassword({ currentPassword: "wrong-pass" })
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		await expect(changePassword()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});

	it.each([
		[
			"没有本地密码的账号：BAD_REQUEST，不校验密码",
			() => changePassword({}, { ...user, passwordHash: null }),
			mocks.verifyPassword,
		],
		[
			"新密码与旧密码相同：BAD_REQUEST，不修改密码",
			() => changePassword({ newPassword: CURRENT }),
			mocks.updateUserPasswordHash,
		],
		[
			"新密码太短：输入校验失败，不校验密码",
			() => changePassword({ newPassword: "short" }),
			mocks.verifyPassword,
		],
	])("%s", async (_name, invoke, untouched) => {
		await expect(invoke()).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(untouched).not.toHaveBeenCalled();
	});
});

describe("auth.login：没有本地密码的账号", () => {
	it("password_hash 为 null：登录失败，但仍然用诱饵哈希校验一次", async () => {
		mocks.getUserByUsername.mockResolvedValue({ ...user, passwordHash: null });
		await expect(login("admin", CURRENT)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.verifyPassword).toHaveBeenCalledTimes(1);
		expect(mocks.verifyPassword.mock.calls[0]?.[1]).toMatch(STORED_PBKDF2_HASH);
	});

	it("本地账号密码正确：登录成功，返回 mustChangePassword", async () => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login("admin", CURRENT)).resolves.toMatchObject({
			mustChangePassword: true,
			username: "admin",
		});
	});
});
