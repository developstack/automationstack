import type { AppRouter } from "@automationstack/api/routers/index";
import { env } from "@automationstack/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { toast } from "sonner";

import { getClientId } from "@/realtime/identity";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const QUERY_STALE_TIME_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
/*
 * 缓存驻留时长必须显著大于 staleTime，否则 staleTime 说的话没人执行。
 *
 * gcTime 的默认值是 5 分钟，比上面那一分钟的新鲜期只长四分钟：离开某一页
 * 五分钟再回来，那份数据已经被回收，路由 loader 的 ensureQueryData 只能重新
 * 发一次请求，整页退回 pendingComponent——而「切走一会儿再切回来」恰恰是这个
 * 工具里最常见的动作（去看一眼别的模块、开个对话框、切到别的项目再回来）。
 *
 * staleTime 决定的是「要不要在后台重新验证」，gcTime 决定的是「还有没有东西
 * 可以先拿来渲染」。后者短于前者的量级时，过期重验这条快路径根本没机会走到：
 * 每次回来都是冷启动。30 分钟覆盖住一个正常的工作时段，代价只是多留一份
 * 已经取过的 JSON 在内存里。
 */
const QUERY_GC_TIME_MINUTES = 30;
const QUERY_GC_TIME_MS =
	QUERY_GC_TIME_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

declare module "@tanstack/react-query" {
	interface Register {
		mutationMeta: {
			/**
			 * Set on mutations that render their own error feedback
			 * (e.g. optimistic-lock CONFLICT toasts) to silence the
			 * global MutationCache toast below.
			 */
			suppressErrorToast?: boolean;
		};
	}
}

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: QUERY_GC_TIME_MS,
				staleTime: QUERY_STALE_TIME_MS,
			},
		},
		mutationCache: new MutationCache({
			onError: (error, _variables, _context, mutation) => {
				if (mutation.meta?.suppressErrorToast) {
					return;
				}
				toast.error(error.message);
			},
		}),
		queryCache: new QueryCache({
			onError: (error, query) => {
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
	});
}

type ProcessEnvLike = Record<string, string | undefined> | undefined;

function getProcessEnv(): ProcessEnvLike {
	return (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
}

function stripTrailingSlash(value: string) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function pickVercelUrl(processEnv: ProcessEnvLike) {
	if (processEnv?.VERCEL_ENV === "production") {
		return processEnv.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv.VERCEL_URL;
	}
	return processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL;
}

function getVercelOrigin(processEnv: ProcessEnvLike) {
	const vercelUrl = pickVercelUrl(processEnv);
	return (
		vercelUrl &&
		(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`)
	);
}

function getServerUrl(url: string) {
	const processEnv = getProcessEnv();
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		return stripTrailingSlash(processEnv.SERVER_URL);
	}

	const normalized = stripTrailingSlash(url);

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	const vercelOrigin = getVercelOrigin(processEnv);
	if (vercelOrigin) {
		return `${vercelOrigin}${normalized}`;
	}

	return `http://localhost:3000${normalized}`;
}
/**
 * SSR 期间把浏览器的会话 cookie 转发给 API。
 *
 * 路由 loader 在服务端跑，此时的 fetch 不是浏览器发的，不会自动带 cookie——
 * 不转发的话所有受保护过程在首屏都会 UNAUTHORIZED，用户看到的是一闪而过的
 * 登录页。浏览器端返回空串：那边由 `credentials: "include"` 自动带 cookie，
 * 而且 HttpOnly 的会话本来就读不到。
 *
 * `createIsomorphicFn` 的 server 分支会被 vite 插件从客户端产物里整段删掉，
 * 因此 `@tanstack/react-start/server` 不会被打进浏览器包。
 */
const forwardedCookie = createIsomorphicFn()
	.client(() => "")
	.server(() => getRequestHeader("cookie") ?? "");

/**
 * `x-client-id` 标识的是**标签页**，不是身份：同一个人开两个标签页要各自算一个
 * 光标，服务端也靠它让触发者跳过自己引发的失效事件。身份（用户名）一律由服务端
 * 从会话 cookie 里读，客户端不再自报——原先的 `x-client-name` 已随协作昵称一起删除。
 */
function requestHeaders(): Record<string, string> {
	const cookie = forwardedCookie();
	if (typeof window === "undefined") {
		return cookie ? { cookie } : {};
	}
	return { "x-client-id": getClientId() };
}

const link = new RPCLink({
	// 会话装在 HttpOnly cookie 里，跨端口请求必须显式声明才会带上
	fetch: (request, init) =>
		globalThis.fetch(request, { ...init, credentials: "include" }),
	headers: requestHeaders,
	url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
});

const getORPCClient = () => createORPCClient(link) as RouterClient<AppRouter>;

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
