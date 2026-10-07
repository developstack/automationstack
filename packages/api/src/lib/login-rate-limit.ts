const ONE_SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const ONE_MINUTE_MS = SECONDS_PER_MINUTE * ONE_SECOND_MS;

const IP_WINDOW_MS = ONE_MINUTE_MS;
const IP_MAX_ATTEMPTS_PER_WINDOW = 10;

const BACKOFF_AFTER_FAILURES = 5;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_BASE_MS = BACKOFF_BASE_SECONDS * ONE_SECOND_MS;
const BACKOFF_MAX_MINUTES = 15;
const BACKOFF_MAX_MS = BACKOFF_MAX_MINUTES * ONE_MINUTE_MS;
const BACKOFF_GROWTH = 2;

const MAX_CONCURRENT_VERIFICATIONS = 2;

const SWEEP_INTERVAL_MS = ONE_MINUTE_MS;
const PAIR_RECORD_TTL_MS = BACKOFF_MAX_MS;

const MAX_TRACKED_IPS = 10_000;
const MAX_TRACKED_PAIRS = 20_000;

const UNKNOWN_IP = "unknown";

export const TOO_MANY_LOGIN_ATTEMPTS_MESSAGE = "登录尝试过于频繁，请稍后再试";

export interface LoginAttemptKey {
	clientIp: string | null;
	username: string;
}

export type LoginGateDecision =
	| { kind: "allowed" }
	| { kind: "rejected"; retryAfterSeconds: number };

export type VerificationSlotResult<T> =
	| { kind: "ran"; value: T }
	| { kind: "saturated" };

interface IpWindow {
	attempts: number[];
}

interface PairRecord {
	blockedUntil: number;
	consecutiveFailures: number;
	lastSeenAt: number;
}

const ipWindows = new Map<string, IpWindow>();
const pairRecords = new Map<string, PairRecord>();
let lastSweptAt = 0;
let inFlightVerifications = 0;

const PAIR_KEY_SEPARATOR = "\u0000";

function pairKeyOf(key: LoginAttemptKey): string {
	return `${key.clientIp ?? UNKNOWN_IP}${PAIR_KEY_SEPARATOR}${key.username.toLowerCase()}`;
}

function backoffDelayMs(consecutiveFailures: number): number {
	const overshoot = consecutiveFailures - BACKOFF_AFTER_FAILURES;
	if (overshoot < 0) {
		return 0;
	}
	return Math.min(
		BACKOFF_BASE_MS * BACKOFF_GROWTH ** overshoot,
		BACKOFF_MAX_MS
	);
}

function sweepIfDue(now: number): void {
	if (now - lastSweptAt < SWEEP_INTERVAL_MS) {
		return;
	}
	lastSweptAt = now;
	const ipCutoff = now - IP_WINDOW_MS;
	for (const [key, window] of ipWindows) {
		if ((window.attempts.at(-1) ?? 0) <= ipCutoff) {
			ipWindows.delete(key);
		}
	}
	const pairCutoff = now - PAIR_RECORD_TTL_MS;
	for (const [key, record] of pairRecords) {
		if (record.lastSeenAt <= pairCutoff && record.blockedUntil <= now) {
			pairRecords.delete(key);
		}
	}
}

function consumeIpBudget(clientIp: string | null, now: number): number {
	if (clientIp === null) {
		return 0;
	}
	const window = ipWindows.get(clientIp);
	if (window === undefined) {
		if (ipWindows.size < MAX_TRACKED_IPS) {
			ipWindows.set(clientIp, { attempts: [now] });
		}
		return 0;
	}
	const kept = window.attempts.filter((at) => at > now - IP_WINDOW_MS);
	window.attempts = kept;
	if (kept.length >= IP_MAX_ATTEMPTS_PER_WINDOW) {
		return (kept[0] ?? now) + IP_WINDOW_MS - now;
	}
	kept.push(now);
	return 0;
}

function pairBackoffRemainingMs(key: string, now: number): number {
	const record = pairRecords.get(key);
	if (record === undefined) {
		return 0;
	}
	record.lastSeenAt = now;
	return record.blockedUntil > now ? record.blockedUntil - now : 0;
}

function rejected(remainingMs: number): LoginGateDecision {
	return {
		kind: "rejected",
		retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / ONE_SECOND_MS)),
	};
}

export function checkLoginGate(key: LoginAttemptKey): LoginGateDecision {
	const now = Date.now();
	sweepIfDue(now);
	const backoffRemainingMs = pairBackoffRemainingMs(pairKeyOf(key), now);
	if (backoffRemainingMs > 0) {
		return rejected(backoffRemainingMs);
	}
	const ipWaitMs = consumeIpBudget(key.clientIp, now);
	if (ipWaitMs > 0) {
		return rejected(ipWaitMs);
	}
	return { kind: "allowed" };
}

export async function runInVerificationSlot<T>(
	run: () => Promise<T>
): Promise<VerificationSlotResult<T>> {
	if (inFlightVerifications >= MAX_CONCURRENT_VERIFICATIONS) {
		return { kind: "saturated" };
	}
	inFlightVerifications += 1;
	try {
		return { kind: "ran", value: await run() };
	} finally {
		inFlightVerifications -= 1;
	}
}

export function recordLoginFailure(key: LoginAttemptKey): void {
	const now = Date.now();
	const pairKey = pairKeyOf(key);
	const record = pairRecords.get(pairKey);
	if (record === undefined) {
		if (pairRecords.size < MAX_TRACKED_PAIRS) {
			pairRecords.set(pairKey, {
				blockedUntil: 0,
				consecutiveFailures: 1,
				lastSeenAt: now,
			});
		}
		return;
	}
	record.consecutiveFailures += 1;
	record.lastSeenAt = now;
	record.blockedUntil = now + backoffDelayMs(record.consecutiveFailures);
}

export function recordLoginSuccess(key: LoginAttemptKey): void {
	pairRecords.delete(pairKeyOf(key));
}

export function resetLoginRateLimitState(): void {
	ipWindows.clear();
	pairRecords.clear();
	lastSweptAt = 0;
	inFlightVerifications = 0;
}
