import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetLoginRateLimitState } from "../../lib/login-rate-limit";
import { testUser } from "../../test-fixtures";
import { effectiveSettings } from "../settings-fixtures";
import { loginWithLocalPassword } from "./local-password-login";
import { authConfigOf, authProviderFor, isLocalLoginEnabled } from "./resolve";
import type { LocalLoginPolicy } from "./types";

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

function login(
	policy: LocalLoginPolicy,
	password = PASSWORD,
	auditLog = vi.fn()
) {
	return {
		auditLog,
		outcome: loginWithLocalPassword(
			{ clientIp: "203.0.113.7", password, username: "admin" },
			policy,
			auditLog
		),
	};
}

beforeEach(() => {
	resetLoginRateLimitState();
	mocks.getUserByUsername.mockReset();
	mocks.verifyPassword.mockClear();
});

describe("loginWithLocalPassword：local 模式（行为与阶段 1 相同）", () => {
	it("密码正确：登录成功，不写审计日志", async () => {
		mocks.getUserByUsername.mockResolvedValue(member);
		const { auditLog, outcome } = login("all-local-accounts");
		await expect(outcome).resolves.toEqual({ kind: "ok", user: member });
		expect(auditLog).not.toHaveBeenCalled();
	});

	it.each([
		["密码错误", member, "wrong-password"],
		[
			"外部账号即使有哈希也不能登录",
			testUser({ ...admin, authSource: "casdoor" }),
			PASSWORD,
		],
		[
			"已停用的账号：密码正确也登录失败",
			testUser({ ...admin, disabledAt: new Date() }),
			PASSWORD,
		],
	])("%s：rejected", async (_name, user, password) => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(
			login("all-local-accounts", password).outcome
		).resolves.toEqual({ kind: "rejected" });
	});

	it.each([
		["用户不存在", null],
		["password_hash 为 null", testUser({ ...admin, passwordHash: null })],
	])("%s：用诱饵哈希校验一次，结果与密码错误相同", async (_name, user) => {
		mocks.getUserByUsername.mockResolvedValue(user);
		await expect(login("all-local-accounts").outcome).resolves.toEqual({
			kind: "rejected",
		});
		expect(mocks.verifyPassword).toHaveBeenCalledTimes(1);
		expect(mocks.verifyPassword.mock.calls[0]?.[1]).toMatch(STORED_PBKDF2_HASH);
	});

	it("连续失败后限流：rate-limited，不再查询账号", async () => {
		mocks.getUserByUsername.mockResolvedValue(member);
		for (let index = 0; index < BACKOFF_AFTER_FAILURES + 1; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 限流按失败顺序计数，必须逐次执行
			await login("all-local-accounts", "wrong-password").outcome;
		}
		mocks.getUserByUsername.mockClear();
		await expect(login("all-local-accounts").outcome).resolves.toEqual({
			kind: "rate-limited",
		});
		expect(mocks.getUserByUsername).not.toHaveBeenCalled();
	});
});

describe("loginWithLocalPassword：casdoor 模式的应急登录（D7、D15）", () => {
	it("本地管理员可以登录，并写一行审计日志，包含用户名、不含密码", async () => {
		mocks.getUserByUsername.mockResolvedValue(admin);
		const { auditLog, outcome } = login("local-admins-only");
		await expect(outcome).resolves.toEqual({ kind: "ok", user: admin });
		expect(auditLog).toHaveBeenCalledTimes(1);
		const message = String(auditLog.mock.calls[0]?.[0]);
		expect(message).toContain("admin");
		expect(message).not.toContain(PASSWORD);
	});

	it("本地普通用户密码正确也不能登录，结果与密码错误相同", async () => {
		mocks.getUserByUsername.mockResolvedValue(member);
		const { auditLog, outcome } = login("local-admins-only");
		await expect(outcome).resolves.toEqual({ kind: "rejected" });
		expect(auditLog).not.toHaveBeenCalled();
	});

	it("本地登录关闭：disabled，不查询账号，不校验密码", async () => {
		await expect(login("disabled").outcome).resolves.toEqual({
			kind: "disabled",
		});
		expect(mocks.getUserByUsername).not.toHaveBeenCalled();
		expect(mocks.verifyPassword).not.toHaveBeenCalled();
	});
});

describe("认证提供方的选择", () => {
	it("local 模式：所有本地账号，没有 Casdoor 入口", () => {
		const settings = effectiveSettings({ provider: "local" });
		expect(authProviderFor(settings).localLoginPolicy(settings)).toBe(
			"all-local-accounts"
		);
		expect(authConfigOf(settings)).toEqual({
			casdoorLoginUrl: null,
			localLoginEnabled: true,
			provider: "local",
		});
	});

	it("local 模式不读取 AUTH_ALLOW_LOCAL_LOGIN", () => {
		expect(
			isLocalLoginEnabled(
				effectiveSettings({ allowLocalLogin: false, provider: "local" })
			)
		).toBe(true);
	});

	it("casdoor 模式：AUTH_ALLOW_LOCAL_LOGIN=true 时只开放给本地管理员", () => {
		const settings = effectiveSettings({ provider: "casdoor" });
		expect(authProviderFor(settings).localLoginPolicy(settings)).toBe(
			"local-admins-only"
		);
		expect(authConfigOf(settings).localLoginEnabled).toBe(true);
	});

	it("casdoor 模式：AUTH_ALLOW_LOCAL_LOGIN=false 时本地登录关闭", () => {
		const settings = effectiveSettings({
			allowLocalLogin: false,
			provider: "casdoor",
		});
		expect(authConfigOf(settings)).toEqual({
			casdoorLoginUrl: null,
			localLoginEnabled: false,
			provider: "casdoor",
		});
	});
});
