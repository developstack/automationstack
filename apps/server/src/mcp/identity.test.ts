import { testUser } from "@automationstack/api/test-fixtures";
import { describe, expect, it } from "vitest";

import { MCP_CLIENT_ID, mcpContext } from "./identity";

describe("mcpContext", () => {
	// actor.name 会落进用例的 lastModifiedBy；actor.clientId 与任何真实标签页都不会相同；
	// MCP 不走登录/登出，所以不下发 cookie
	it.each([
		["member", false],
		["admin", true],
	] as const)(
		"context.user 就是 token 的主人本人（%s），平台角色原样带过去；secure=%s 跟随请求的 scheme",
		(role, secure) => {
			const tokenOwner = testUser({ role, username: "qa-bot" });
			const context = mcpContext(tokenOwner, secure);
			expect(context.user).toBe(tokenOwner);
			expect(context).toEqual({
				actor: { clientId: MCP_CLIENT_ID, name: "qa-bot" },
				cookies: [],
				secure,
				user: { ...tokenOwner, role },
			});
		}
	);
});
