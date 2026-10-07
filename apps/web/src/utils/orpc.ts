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
import {
	isUnauthorizedError,
	notifySessionExpired,
} from "@/utils/session-expiry";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const QUERY_STALE_TIME_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
const QUERY_GC_TIME_MINUTES = 30;
const QUERY_GC_TIME_MS =
	QUERY_GC_TIME_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

declare module "@tanstack/react-query" {
	interface Register {
		mutationMeta: {
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
				if (isUnauthorizedError(error)) {
					notifySessionExpired();
					return;
				}
				if (mutation.meta?.suppressErrorToast) {
					return;
				}
				toast.error(error.message);
			},
		}),
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (isUnauthorizedError(error)) {
					notifySessionExpired();
					return;
				}
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
const forwardedCookie = createIsomorphicFn()
	.client(() => "")
	.server(() => getRequestHeader("cookie") ?? "");

function requestHeaders(): Record<string, string> {
	const cookie = forwardedCookie();
	if (typeof window === "undefined") {
		return cookie ? { cookie } : {};
	}
	return { "x-client-id": getClientId() };
}

const link = new RPCLink({
	fetch: (request, init) =>
		globalThis.fetch(request, { ...init, credentials: "include" }),
	headers: requestHeaders,
	url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
});

const getORPCClient = () => createORPCClient(link) as RouterClient<AppRouter>;

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
