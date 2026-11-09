import { resolveUserFromCookies } from "@automationstack/api/context";
import { canEnterProject } from "@automationstack/api/lib/project-access";
import { colorForName } from "@automationstack/api/realtime/presence-color";
import { isProjectMember } from "@automationstack/db/repositories/project-members-repository";
import { env } from "@automationstack/env/server";
import type { Context as HonoContext } from "hono";

import { isAllowedOrigin } from "../middleware/allowed-origin";

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

function hasAllowedOrigin(context: HonoContext): boolean {
	const origin = context.req.header("origin");
	return (
		!origin ||
		isAllowedOrigin(origin, {
			corsOrigin: env.CORS_ORIGIN,
			nodeEnv: env.NODE_ENV,
		})
	);
}

export async function resolveHandshake(
	context: HonoContext
): Promise<HandshakeResult> {
	const clientId = context.req.query("clientId");
	const projectId = context.req.query("projectId");
	if (!(clientId && projectId && hasAllowedOrigin(context))) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const user = await resolveUserFromCookies(context.req.header("cookie"));
	if (user === null) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const isMember = await isProjectMember(projectId, user.id);
	if (!canEnterProject({ isMember, platformRole: user.role })) {
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
