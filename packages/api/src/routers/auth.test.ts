import type { User } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoginRateLimitState } from "../lib/login-rate-limit";
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
	getProjectRole: vi.fn(),
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

const user: User = {
	authSource: "local",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	externalId: null,
	id: "22222222-2222-4222-8222-222222222222",
	mustChangePassword: true,
	passwordHash: `hash:${CURRENT}`,
	role: "admin",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	username: "admin",
};

function contextFor(current: User | null) {
	return {
		actor: current === null ? null : { clientId: "t", name: current.username },
		cookies: [] as string[],
		secure: false,
		user: current,
	};
}

function changePassword(
	current: User,
	input: { currentPassword: string; newPassword: string }
) {
	return call(authRouter.changePassword, input, {
		context: contextFor(current),
		path: ["auth", "changePassword"],
	});
}

function login(username: string, password: string) {
	return call(
		authRouter.login,
		{ password, username },
		{ context: contextFor(null), path: ["auth", "login"] }
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
		await expect(
			changePassword(user, { currentPassword: CURRENT, newPassword: NEXT })
		).resolves.toEqual({ ok: true });
		expect(mocks.updateUserPasswordHash).toHaveBeenCalledWith(
			user.id,
			`hash:${NEXT}`,
			false
		);
	});

	it("旧密码错误：BAD_REQUEST（不是 UNAUTHORIZED），不修改密码", async () => {
		await expect(
			changePassword(user, { currentPassword: "wrong-pass", newPassword: NEXT })
		).rejects.toMatchObject({ code: "BAD_REQUEST", message: "当前密码错误" });
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});

	it("连续输错旧密码会触发与登录相同的限流", async () => {
		const BACKOFF_AFTER_FAILURES = 5;
		for (let index = 0; index < BACKOFF_AFTER_FAILURES; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 限流按失败顺序计数，必须逐次执行
			await expect(
				changePassword(user, {
					currentPassword: "wrong-pass",
					newPassword: NEXT,
				})
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		await expect(
			changePassword(user, { currentPassword: CURRENT, newPassword: NEXT })
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});

	it("没有本地密码的账号：BAD_REQUEST，不校验密码", async () => {
		await expect(
			changePassword(
				{ ...user, passwordHash: null },
				{ currentPassword: CURRENT, newPassword: NEXT }
			)
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
	});

	it("新密码与旧密码相同：BAD_REQUEST", async () => {
		await expect(
			changePassword(user, { currentPassword: CURRENT, newPassword: CURRENT })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.updateUserPasswordHash).not.toHaveBeenCalled();
	});

	it("新密码太短：输入校验失败", async () => {
		await expect(
			changePassword(user, { currentPassword: CURRENT, newPassword: "short" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
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

	it("外部账号即使有哈希也不能用本地密码登录", async () => {
		mocks.getUserByUsername.mockResolvedValue({
			...user,
			authSource: "casdoor",
		});
		await expect(login("admin", CURRENT)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("本地账号密码正确：登录成功，返回 mustChangePassword", async () => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login("admin", CURRENT)).resolves.toMatchObject({
			mustChangePassword: true,
			username: "admin",
		});
	});
});
