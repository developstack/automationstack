import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";
import { env } from "@automationstack/env/server";
import type { Context as HonoContext } from "hono";

import {
	readCookieHeader,
	SESSION_COOKIE,
	verifySessionToken,
} from "./auth/session";
import { isSessionUserAllowed } from "./auth/session-policy";
import { getEffectiveAuthSettings } from "./auth/settings-store";

export interface CreateContextOptions {
	context: HonoContext;
}

export interface Actor {
	clientId: string;
	name: string;
}

const HEADERLESS_CLIENT_ID = "headless";

function readActor(context: HonoContext, user: User | null): Actor | null {
	if (user === null) {
		return null;
	}
	return {
		clientId: context.req.header("x-client-id") ?? HEADERLESS_CLIENT_ID,
		name: user.username,
	};
}

export async function resolveUserFromCookies(
	cookieHeader: string | null | undefined
): Promise<User | null> {
	const token = readCookieHeader(cookieHeader, SESSION_COOKIE);
	if (!token) {
		return null;
	}
	const userId = await verifySessionToken(token, env.SESSION_SECRET);
	if (!userId) {
		return null;
	}
	const user = await getUserById(userId);
	if (user === null || user.disabledAt !== null) {
		return null;
	}
	// casdoor 模式下的本地普通用户和 local 模式下的 Casdoor 用户：会话失效（plan 021 §10.4、§2 第 12 项）。
	if (!isSessionUserAllowed(user, await getEffectiveAuthSettings())) {
		return null;
	}
	return user;
}

export async function createContext(options: CreateContextOptions) {
	const user = await resolveUserFromCookies(
		options.context.req.header("cookie")
	);
	return {
		actor: readActor(options.context, user),
		cookies: [] as string[],
		secure: options.context.req.url.startsWith("https://"),
		user,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
