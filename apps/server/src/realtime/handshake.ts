import { resolveUserFromCookies } from "@automationstack/api/context";
import { canEnterProject } from "@automationstack/api/lib/project-access";
import { colorForName } from "@automationstack/api/realtime/presence-color";
import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import { env } from "@automationstack/env/server";
import type { Context as HonoContext } from "hono";

const DEFAULT_VIEW = "list";

export interface ConnectionParams {
	clientId: string;
	color: string;
	name: string;
	projectId: string;
	userId: string;
	view: string;
}

export type HandshakeResult =
	| { kind: "ok"; params: ConnectionParams }
	| { kind: "rejected"; reason: string };

export const INVALID_HANDSHAKE_REASON = "invalid realtime handshake";
export const NOT_PROJECT_MEMBER_REASON = "not a project member";

function isAllowedOrigin(context: HonoContext): boolean {
	const origin = context.req.header("origin");
	return !origin || origin === env.CORS_ORIGIN;
}

export async function resolveHandshake(
	context: HonoContext
): Promise<HandshakeResult> {
	const clientId = context.req.query("clientId");
	const projectId = context.req.query("projectId");
	if (!(clientId && projectId && isAllowedOrigin(context))) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const user = await resolveUserFromCookies(context.req.header("cookie"));
	if (user === null) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const projectRole = await getProjectRole(projectId, user.id);
	if (!canEnterProject({ platformRole: user.role, projectRole })) {
		return { kind: "rejected", reason: NOT_PROJECT_MEMBER_REASON };
	}
	return {
		kind: "ok",
		params: {
			clientId,
			color: colorForName(user.username),
			name: user.username,
			projectId,
			userId: user.id,
			view: context.req.query("view") || DEFAULT_VIEW,
		},
	};
}
