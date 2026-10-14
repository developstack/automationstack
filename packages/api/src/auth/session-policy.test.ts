import { API_TOKEN_PREFIX } from "@automationstack/db/api-token";
import type { User } from "@automationstack/db/schema/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUserFromCookies } from "../context";
import { testUser } from "../test-fixtures";
import { resolveUserFromBearer } from "./bearer";
import { createSessionToken, SESSION_COOKIE } from "./session";
import { isSessionUserAllowed } from "./session-policy";
import { effectiveSettings } from "./settings-fixtures";

const SESSION_SECRET = "test-session-secret-0123456789abcdef";

const mocks = vi.hoisted(() => ({
	findActiveApiTokenByHash: vi.fn(),
	getEffectiveAuthSettings: vi.fn(),
	getUserById: vi.fn(),
}));

vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserById: mocks.getUserById,
}));
vi.mock("@automationstack/db/repositories/api-tokens-repository", () => ({
	findActiveApiTokenByHash: mocks.findActiveApiTokenByHash,
	touchApiTokenLastUsed: vi.fn(() => Promise.resolve()),
}));
vi.mock("./settings-store", () => ({
	getEffectiveAuthSettings: mocks.getEffectiveAuthSettings,
}));

const localMember = testUser({ role: "member", username: "user" });
const localAdmin = testUser({ username: "user" });
const casdoorMember = testUser({
	...localMember,
	authSource: "casdoor",
	externalId: "ext",
	passwordHash: null,
});
const casdoorAdmin = testUser({ ...casdoorMember, role: "admin" });

const casdoorMode = effectiveSettings({ provider: "casdoor" });
const localMode = effectiveSettings({ provider: "local" });

async function viaCookie(user: User): Promise<User | null> {
	mocks.getUserById.mockResolvedValue(user);
	const token = await createSessionToken(user.id, SESSION_SECRET);
	return await resolveUserFromCookies(`${SESSION_COOKIE}=${token}`);
}

async function viaBearer(user: User): Promise<User | null> {
	mocks.getUserById.mockResolvedValue(user);
	mocks.findActiveApiTokenByHash.mockResolvedValue({
		id: "t",
		userId: user.id,
	});
	return await resolveUserFromBearer(
		`Bearer ${API_TOKEN_PREFIX}${"a".repeat(32)}`
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("isSessionUserAllowed（§10.4、D7）", () => {
	it.each([
		["casdoor 模式：本地普通用户不允许", localMember, casdoorMode, false],
		["casdoor 模式：本地管理员允许", localAdmin, casdoorMode, true],
		["casdoor 模式：Casdoor 用户允许", casdoorMember, casdoorMode, true],
		["local 模式：本地普通用户允许", localMember, localMode, true],
		["local 模式：本地管理员允许", localAdmin, localMode, true],
		[
			"local 模式：Casdoor 用户不允许（§2 第 12 项）",
			casdoorMember,
			localMode,
			false,
		],
		["local 模式：Casdoor 管理员也不允许", casdoorAdmin, localMode, false],
	])("%s", (_name, user, settings, expected) => {
		expect(isSessionUserAllowed(user, settings)).toBe(expected);
	});
});

describe.each([
	["cookie", viaCookie],
	["Bearer token", viaBearer],
] as const)("会话 cookie 和 API token 使用同一规则：%s", (_name, resolve) => {
	it.each([
		["casdoor 模式下本地普通用户被拒绝", casdoorMode, localMember, null],
		["casdoor 模式下本地管理员仍然有效", casdoorMode, localAdmin, localAdmin],
		["local 模式下本地普通用户有效", localMode, localMember, localMember],
		[
			"local 模式下 Casdoor 用户被拒绝（§2 第 12 项）",
			localMode,
			casdoorMember,
			null,
		],
		["local 模式下 Casdoor 管理员也被拒绝", localMode, casdoorAdmin, null],
		[
			"被停用的 Casdoor 用户被拒绝",
			casdoorMode,
			testUser({ ...casdoorMember, disabledAt: new Date() }),
			null,
		],
	])("%s", async (_case, settings, user, expected) => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(settings);
		await expect(resolve(user)).resolves.toEqual(expected);
	});

	it("再切到 casdoor 模式后，同一个 Casdoor 用户恢复有效", async () => {
		mocks.getEffectiveAuthSettings.mockResolvedValue(localMode);
		await expect(resolve(casdoorMember)).resolves.toBeNull();
		mocks.getEffectiveAuthSettings.mockResolvedValue(casdoorMode);
		await expect(resolve(casdoorMember)).resolves.toEqual(casdoorMember);
	});
});
