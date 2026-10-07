import { ORPCError } from "@orpc/client";

export function isUnauthorizedError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

export const LOGIN_PATHNAME = "/login";

export function isLoginPathname(pathname: string): boolean {
	return pathname === LOGIN_PATHNAME || pathname === `${LOGIN_PATHNAME}/`;
}

type SessionExpiredHandler = () => void;

let handleSessionExpired: SessionExpiredHandler | null = null;
let redirecting = false;

export function setSessionExpiredHandler(
	handler: SessionExpiredHandler | null
): void {
	handleSessionExpired = handler;
}

export function notifySessionExpired(): void {
	if (redirecting || handleSessionExpired === null) {
		return;
	}
	redirecting = true;
	handleSessionExpired();
}

export function resetSessionExpiredNotice(): void {
	redirecting = false;
}
