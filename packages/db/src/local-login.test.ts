import { describe, expect, it } from "vitest";

import { localLoginAdminBlocker } from "./local-login";

const HASH = "pbkdf2_sha256$1$c2FsdA==$aGFzaA==";

const localAdmin = {
	disabledAt: null,
	passwordHash: HASH,
	role: "admin" as const,
};

describe("localLoginAdminBlocker", () => {
	it.each([
		[null, {}],
		["no-password", { passwordHash: null }],
		["disabled", { disabledAt: new Date("2026-01-01T00:00:00Z") }],
		["not-admin", { role: "member" as const }],
	])("%s（null 表示可以登录的管理员没有阻碍）", (expected, patch) => {
		expect(localLoginAdminBlocker({ ...localAdmin, ...patch })).toBe(expected);
	});
});
