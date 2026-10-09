import type { User } from "@automationstack/db/schema/users";
import { describe, expect, it } from "vitest";

import { MCP_CLIENT_ID, mcpContext } from "./identity";

const tokenOwner: User = {
	authSource: "local",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	externalId: null,
	id: "55555555-5555-4555-8555-555555555555",
	mustChangePassword: false,
	passwordHash: "argon2id$placeholder",
	role: "member",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	username: "qa-bot",
};

describe("mcpContext", () => {
	it("context.user 就是 token 的主人本人，一个字段都不换", () => {
		expect(mcpContext(tokenOwner, false).user).toBe(tokenOwner);
	});

	it("平台角色原样带过去，MCP 不会给谁加一档权限", () => {
		const admin: User = { ...tokenOwner, role: "admin" };
		expect(mcpContext(tokenOwner, false).user?.role).toBe("member");
		expect(mcpContext(admin, false).user?.role).toBe("admin");
	});

	it("actor.name 是真人的用户名——它会落进用例的 lastModifiedBy", () => {
		expect(mcpContext(tokenOwner, false).actor?.name).toBe("qa-bot");
	});

	it("actor.clientId 是固定的渠道标识，与任何真实标签页都不会相同", () => {
		expect(mcpContext(tokenOwner, false).actor?.clientId).toBe(MCP_CLIENT_ID);
	});

	it("不下发任何 cookie：MCP 不走登录/登出", () => {
		expect(mcpContext(tokenOwner, true).cookies).toEqual([]);
	});

	it("secure 跟随请求的 scheme", () => {
		expect(mcpContext(tokenOwner, true).secure).toBe(true);
		expect(mcpContext(tokenOwner, false).secure).toBe(false);
	});
});
