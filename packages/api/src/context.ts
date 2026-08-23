import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";
import { env } from "@automationstack/env/server";
import type { Context as HonoContext } from "hono";

import {
	readCookieHeader,
	SESSION_COOKIE,
	verifySessionToken,
} from "./auth/session";

export interface CreateContextOptions {
	context: HonoContext;
}

/**
 * 写操作的署名者：`name` 会落进用例的 lastModifiedBy / savedBy，
 * 并作为实时协作里 presence 与失效事件的触发者。
 *
 * `name` 来自会话用户的用户名——不再是客户端自由填写的协作昵称。
 * `clientId` 仍由客户端的 `x-client-id` 头提供：它标识的是**标签页**
 * （同一个人开两个标签页要能各自算一个光标），不是身份，因此可以自报。
 */
export interface Actor {
	clientId: string;
	name: string;
}

/** 没带 `x-client-id`（脚本 / curl）时的占位标签页 id。 */
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

/**
 * 按会话 cookie 解析出当前用户。
 *
 * 每个请求都重新读一遍 users 行，而不是把用户名塞进令牌：令牌无法吊销，
 * 「停用账号立即生效」只能靠这一次读库拿到最新的 disabledAt / role。
 * 已停用的账号视同未登录（连 auth.me 都返回 null，前端会被弹回登录页）。
 *
 * 导出给 WebSocket 握手复用（apps/server/src/realtime/ws.ts）：升级请求不走
 * oRPC，拿不到这里的 Context，但同样要按 cookie 认人。
 */
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
	return user;
}

export async function createContext(options: CreateContextOptions) {
	const user = await resolveUserFromCookies(
		options.context.req.header("cookie")
	);
	return {
		actor: readActor(options.context, user),
		/**
		 * 登录 / 登出过程要往响应上挂 `Set-Cookie`。oRPC 的 handler 只返回
		 * 数据，够不到 Response 头，所以用这个数组当收集器，由
		 * apps/server/src/index.ts 在拿到 RPC 响应后逐条 append。
		 */
		cookies: [] as string[],
		/** HTTPS 请求才给 cookie 加 `Secure`（本地 http 开发要能登录）。 */
		secure: options.context.req.url.startsWith("https://"),
		user,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
