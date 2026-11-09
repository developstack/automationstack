import { API_TOKEN_PREFIX } from "@automationstack/db/api-token";
import type { User } from "@automationstack/db/schema/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUserFromCookies } from "../context";
import { testUser } from "../test-fixtures";
import { resolveUserFromBearer } from "./bearer";
import { createSessionToken, SESSION_COOKIE } from "./session";
import { isSessionUserAllowed } from "./session-policy";

const SESSION_SECRET = "test-session-secret-0123456789abcdef";

const mocks = vi.hoisted(() => ({
	findActiveApiTokenByHash: vi.fn(),
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

const member = testUser({ role: "member", username: "user" });
const admin = testUser({ username: "user" });
/** 以前的 Casdoor 账号：迁移后没有本地密码。 */
const formerCasdoorUser = testUser({
	...member,
	externalId: "ext",
	passwordHash: null,
});

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

describe("isSessionUserAllowed", () => {
	it.each([
		["有本地密码的普通用户允许", member, true],
		["有本地密码的管理员允许", admin, true],
		["没有本地密码的账号不允许", formerCasdoorUser, false],
	])("%s", (_name, user, expected) => {
		expect(isSessionUserAllowed(user)).toBe(expected);
	});
});

describe.each([
	["cookie", viaCookie],
	["Bearer token", viaBearer],
] as const)("会话 cookie 和 API token 使用同一规则：%s", (_name, resolve) => {
	it.each([
		["普通用户有效", member, member],
		["管理员有效", admin, admin],
		["没有本地密码的账号被拒绝", formerCasdoorUser, null],
		[
			"被停用的账号被拒绝",
			testUser({ ...member, disabledAt: new Date() }),
			null,
		],
	])("%s", async (_case, user, expected) => {
		await expect(resolve(user)).resolves.toEqual(expected);
	});
});
