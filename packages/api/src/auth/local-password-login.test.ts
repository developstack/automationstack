import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoginRateLimitState } from "../lib/login-rate-limit";
import { testUser } from "../test-fixtures";
import { loginWithLocalPassword } from "./local-password-login";

const mocks = vi.hoisted(() => ({
	getUserByUsername: vi.fn(),
	verifyPassword: vi.fn((password: string, stored: string) =>
		Promise.resolve(stored === `hash:${password}`)
	),
}));

vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserByUsername: mocks.getUserByUsername,
}));
vi.mock("@automationstack/db/password", () => ({
	verifyPassword: mocks.verifyPassword,
}));

const PASSWORD = "correct-password";
const STORED_PBKDF2_HASH = /^pbkdf2_sha256\$/;
const BACKOFF_AFTER_FAILURES = 5;

const admin = testUser({ passwordHash: `hash:${PASSWORD}` });
const member = testUser({ ...admin, id: "member-id", role: "member" });

function login(password = PASSWORD) {
	return loginWithLocalPassword({
		clientIp: "203.0.113.7",
		password,
		username: "admin",
	});
}

beforeEach(() => {
	resetLoginRateLimitState();
	mocks.getUserByUsername.mockReset();
	mocks.verifyPassword.mockClear();
});

describe("loginWithLocalPassword", () => {
	it.each([
		["普通用户", member],
		["管理员", admin],
	])("%s密码正确：登录成功", async (_name, user) => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login()).resolves.toEqual({ kind: "ok", user });
	});

	it.each([
		["密码错误", member, "wrong-password"],
		[
			"已停用的账号：密码正确也登录失败",
			testUser({ ...admin, disabledAt: new Date() }),
			PASSWORD,
		],
	])("%s：rejected", async (_name, user, password) => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login(password)).resolves.toEqual({ kind: "rejected" });
	});

	it.each([
		["用户不存在", null],
		["password_hash 为 null", testUser({ ...admin, passwordHash: null })],
	])("%s：用诱饵哈希校验一次，结果与密码错误相同", async (_name, user) => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login()).resolves.toEqual({ kind: "rejected" });
		expect(mocks.verifyPassword).toHaveBeenCalledTimes(1);
		expect(mocks.verifyPassword.mock.calls[0]?.[1]).toMatch(STORED_PBKDF2_HASH);
	});

	it("连续失败后限流：rate-limited，不再查询账号", async () => {
		mocks.getUserByUsername.mockResolvedValue(member);
		for (let index = 0; index < BACKOFF_AFTER_FAILURES + 1; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 限流按失败顺序计数，必须逐次执行
			await login("wrong-password");
		}
		mocks.getUserByUsername.mockClear();
		await expect(login()).resolves.toEqual({ kind: "rate-limited" });
		expect(mocks.getUserByUsername).not.toHaveBeenCalled();
	});
});
