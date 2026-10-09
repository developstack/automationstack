import { describe, expect, it } from "vitest";

import { localLoginAdminBlocker, localPasswordHashOf } from "./local-login";

const HASH = "pbkdf2_sha256$1$c2FsdA==$aGFzaA==";

const localAdmin = {
	authSource: "local" as const,
	disabledAt: null,
	passwordHash: HASH,
	role: "admin" as const,
};

describe("localPasswordHashOf", () => {
	it("本地账号返回它的哈希", () => {
		expect(localPasswordHashOf(localAdmin)).toBe(HASH);
	});

	it("没有哈希的本地账号返回 null", () => {
		expect(localPasswordHashOf({ ...localAdmin, passwordHash: null })).toBe(
			null
		);
	});

	it("外部账号即使有哈希也返回 null", () => {
		expect(localPasswordHashOf({ ...localAdmin, authSource: "casdoor" })).toBe(
			null
		);
	});
});

describe("localLoginAdminBlocker", () => {
	it("有效的本地管理员没有阻碍", () => {
		expect(localLoginAdminBlocker(localAdmin)).toBe(null);
	});

	it.each([
		["external-account", { authSource: "casdoor" as const }],
		["no-password", { passwordHash: null }],
		["disabled", { disabledAt: new Date("2026-01-01T00:00:00Z") }],
		["not-admin", { role: "member" as const }],
	])("%s", (expected, patch) => {
		expect(localLoginAdminBlocker({ ...localAdmin, ...patch })).toBe(expected);
	});
});
