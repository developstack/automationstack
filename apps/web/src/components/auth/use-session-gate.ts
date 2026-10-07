import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { sessionQueryOptions } from "@/components/auth/use-session";
import {
	isLoginPathname,
	LOGIN_PATHNAME,
	notifySessionExpired,
	resetSessionExpiredNotice,
	setSessionExpiredHandler,
} from "@/utils/session-expiry";

type AppRouterInstance = ReturnType<typeof useRouter>;

async function redirectToLogin(
	router: AppRouterInstance,
	queryClient: QueryClient
): Promise<void> {
	const { href, pathname } = router.state.location;
	if (isLoginPathname(pathname)) {
		return;
	}
	queryClient.setQueryData(sessionQueryOptions().queryKey, null);
	await router.navigate({
		replace: true,
		search: { redirect: href },
		to: LOGIN_PATHNAME,
	});
	queryClient.clear();
}

export type SessionGateState = "ready" | "waiting";

export function useSessionGate(): SessionGateState {
	const router = useRouter();
	const queryClient = useQueryClient();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const session = useQuery(sessionQueryOptions());

	useEffect(() => {
		setSessionExpiredHandler(() => {
			redirectToLogin(router, queryClient).catch(resetSessionExpiredNotice);
		});
		return () => setSessionExpiredHandler(null);
	}, [queryClient, router]);

	const expired = session.isSuccess && session.data === null;

	useEffect(() => {
		if (session.data) {
			resetSessionExpiredNotice();
			return;
		}
		if (expired && !isLoginPathname(pathname)) {
			notifySessionExpired();
		}
	}, [expired, pathname, session.data]);

	return session.data ? "ready" : "waiting";
}
