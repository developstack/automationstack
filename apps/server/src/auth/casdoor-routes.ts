import {
	type CasdoorRedirect,
	completeCasdoorLogin,
	type LoginFlowContext,
	startCasdoorLogin,
} from "@automationstack/api/auth/casdoor/login-flow";
import { casdoorReconcileScheduler } from "@automationstack/api/auth/casdoor/reconcile";
import { handleCasdoorWebhook } from "@automationstack/api/auth/casdoor/webhook";
import {
	CASDOOR_CALLBACK_PATH,
	CASDOOR_LOGIN_PATH,
	CASDOOR_LOGIN_REDIRECT_PARAM,
	CASDOOR_WEBHOOK_PATH,
	CASDOOR_WEBHOOK_SECRET_HEADER,
} from "@automationstack/api/auth/casdoor-paths";
import { getEffectiveAuthSettings } from "@automationstack/api/auth/settings-store";
import { env } from "@automationstack/env/server";
import type { Context, Hono } from "hono";

const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;

async function flowContext(c: Context): Promise<LoginFlowContext> {
	return {
		frontendOrigin: env.CORS_ORIGIN,
		secure: c.req.url.startsWith("https://"),
		sessionSecret: env.SESSION_SECRET,
		settings: await getEffectiveAuthSettings(),
	};
}

function redirectResponse(result: CasdoorRedirect): Response {
	const headers = new Headers({
		"cache-control": "no-store",
		location: result.location,
	});
	for (const cookie of result.cookies) {
		headers.append("set-cookie", cookie);
	}
	return new Response(null, { headers, status: HTTP_FOUND });
}

/** Casdoor 登录、回调和 webhook 路由（plan 021 T10、T11、D12）。 */
export function registerCasdoorRoutes(app: Hono): void {
	app.get(CASDOOR_LOGIN_PATH, async (c) => {
		const result = await startCasdoorLogin(
			await flowContext(c),
			c.req.query(CASDOOR_LOGIN_REDIRECT_PARAM) ?? null
		);
		return redirectResponse(result);
	});

	app.get(CASDOOR_CALLBACK_PATH, async (c) => {
		const result = await completeCasdoorLogin(await flowContext(c), {
			cookieHeader: c.req.header("cookie"),
			query: new URL(c.req.url).searchParams,
		});
		return redirectResponse(result);
	});

	app.post(CASDOOR_WEBHOOK_PATH, async (c) => {
		const outcome = await handleCasdoorWebhook({
			rawBody: await c.req.text(),
			secretHeader: c.req.header(CASDOOR_WEBHOOK_SECRET_HEADER) ?? null,
			settings: await getEffectiveAuthSettings(),
			triggerReconcile: casdoorReconcileScheduler.trigger,
		});
		if (outcome === "unauthorized") {
			return c.json({ error: "rejected" }, HTTP_UNAUTHORIZED);
		}
		// Casdoor 只把 2xx 当作成功。对账在后台进行，这里立即返回。
		return c.json({ status: outcome });
	});
}
