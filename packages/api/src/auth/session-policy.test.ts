import { API_TOKEN_PREFIX } from "@automationstack/db/api-token";
import type { User } from "@automationstack/db/schema/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUserFromCookies } from "../context";
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

const base: User = {
	authSource: "local",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	externalId: null,
	id: "22222222-2222-4222-8222-222222222222",
	mustChangePassword: false,
	passwordHash: "hash",
	role: "member",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	username: "user",
};

const localMember = base;
const localAdmin: User = { ...base, role: "admin" };
const casdoorMember: User = {
	...base,
	authSource: "casdoor",
	externalId: "ext",
	passwordHash: null,
};

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
	it("casdoor 模式：本地普通用户不允许，本地管理员和 Casdoor 用户允许", () => {
		expect(isSessionUserAllowed(localMember, casdoorMode)).toBe(false);
		expect(isSessionUserAllowed(localAdmin, casdoorMode)).toBe(true);
		expect(isSessionUserAllowed(casdoorMember, casdoorMode)).toBe(true);
	});

	it("local 模式：都允许", () => {
		expect(isSessionUserAllowed(localMember, localMode)).toBe(true);
	});
});

describe("会话 cookie 和 API token 使用同一规则", () => {
	for (const [name, resolve] of [
		["cookie", viaCookie],
		["Bearer token", viaBearer],
	] as const) {
		it(`${name}：casdoor 模式下本地普通用户被拒绝`, async () => {
			mocks.getEffectiveAuthSettings.mockResolvedValue(casdoorMode);
			await expect(resolve(localMember)).resolves.toBeNull();
		});

		it(`${name}：casdoor 模式下本地管理员仍然有效`, async () => {
			mocks.getEffectiveAuthSettings.mockResolvedValue(casdoorMode);
			await expect(resolve(localAdmin)).resolves.toEqual(localAdmin);
		});

		it(`${name}：local 模式下本地普通用户有效`, async () => {
			mocks.getEffectiveAuthSettings.mockResolvedValue(localMode);
			await expect(resolve(localMember)).resolves.toEqual(localMember);
		});

		it(`${name}：被停用的 Casdoor 用户被拒绝`, async () => {
			mocks.getEffectiveAuthSettings.mockResolvedValue(casdoorMode);
			await expect(
				resolve({ ...casdoorMember, disabledAt: new Date() })
			).resolves.toBeNull();
		});
	}
});
