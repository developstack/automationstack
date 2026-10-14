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
	it.each([
		["本地账号返回它的哈希", {}, HASH],
		["没有哈希的本地账号返回 null", { passwordHash: null }, null],
		["外部账号即使有哈希也返回 null", { authSource: "casdoor" as const }, null],
	])("%s", (_name, patch, expected) => {
		expect(localPasswordHashOf({ ...localAdmin, ...patch })).toBe(expected);
	});
});

describe("localLoginAdminBlocker", () => {
	it.each([
		[null, {}],
		["external-account", { authSource: "casdoor" as const }],
		["no-password", { passwordHash: null }],
		["disabled", { disabledAt: new Date("2026-01-01T00:00:00Z") }],
		["not-admin", { role: "member" as const }],
	])("%s（null 表示有效的本地管理员没有阻碍）", (expected, patch) => {
		expect(localLoginAdminBlocker({ ...localAdmin, ...patch })).toBe(expected);
	});
});
