import type { Context } from "@automationstack/api/context";
import type { User } from "@automationstack/db/schema/users";

export const MCP_CLIENT_ID = "mcp";

export function mcpContext(user: User, secure: boolean): Context {
	return {
		actor: { clientId: MCP_CLIENT_ID, name: user.username },
		cookies: [],
		secure,
		user,
	};
}
