import type { User } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../auth/settings-fixtures";
import { resetLoginRateLimitState } from "../lib/login-rate-limit";
import { callContext, testUser } from "../test-fixtures";
import { authRouter } from "./auth";

const mocks = vi.hoisted(() => ({
	getEffectiveAuthSettings: vi.fn(),
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
vi.mock("../auth/settings-store", () => ({
	getEffectiveAuthSettings: mocks.getEffectiveAuthSettings,
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
	mocks.getEffectiveAuthSettings.mockReset();
	mocks.getEffectiveAuthSettings.mockResolvedValue(effectiveSettings());
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

describe("auth.login：按当前生效的认证方式", () => {
	it("casdoor 模式、AUTH_ALLOW_LOCAL_LOGIN=false：FORBIDDEN，不查询账号", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ allowLocalLogin: false, provider: "casdoor" })
		);
		await expect(login("admin", CURRENT)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.getUserByUsername).not.toHaveBeenCalled();
	});

	it("casdoor 模式：本地管理员可以登录，写 WARN 日志", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ provider: "casdoor" })
		);
		mocks.getUserByUsername.mockResolvedValue(user);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {
			// 测试检查审计日志的内容。
		});
		await expect(login("admin", CURRENT)).resolves.toMatchObject({
			username: "admin",
		});
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain("admin");
		expect(String(warn.mock.calls[0]?.[0])).not.toContain(CURRENT);
		warn.mockRestore();
	});

	it("casdoor 模式：本地普通用户不能登录", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ provider: "casdoor" })
		);
		mocks.getUserByUsername.mockResolvedValue({ ...user, role: "member" });
		await expect(login("admin", CURRENT)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("auth.config", () => {
	function config() {
		return call(authRouter.config, undefined, {
			context: callContext(null),
			path: ["auth", "config"],
		});
	}

	it("local 模式：只有本地密码表单", async () => {
		await expect(config()).resolves.toEqual({
			casdoorLoginUrl: null,
			localLoginEnabled: true,
			provider: "local",
		});
	});

	it("casdoor 模式：本地登录由 AUTH_ALLOW_LOCAL_LOGIN 决定，阶段 2 没有 Casdoor 入口", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({ allowLocalLogin: false, provider: "casdoor" })
		);
		await expect(config()).resolves.toEqual({
			casdoorLoginUrl: null,
			localLoginEnabled: false,
			provider: "casdoor",
		});
	});

	it("不返回任何 Casdoor 参数和密钥", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(
			effectiveSettings({
				clientId: "client-id",
				clientSecret: { present: true, value: "client-secret-value" },
				issuer: "https://casdoor.example.com",
			})
		);
		const result = JSON.stringify(await config());
		expect(result).not.toContain("client-secret-value");
		expect(result).not.toContain("client-id");
	});
});
