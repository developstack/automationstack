import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	checkLoginGate,
	recordLoginFailure,
	recordLoginSuccess,
	resetLoginRateLimitState,
	runInVerificationSlot,
} from "./login-rate-limit";

const IP = "203.0.113.7";
const OTHER_IP = "203.0.113.8";

/** 与实现里的常量对齐；改那边的阈值，这里会红。 */
const IP_MAX_ATTEMPTS_PER_WINDOW = 10;
const BACKOFF_AFTER_FAILURES = 5;
const BACKOFF_BASE_SECONDS = 30;

function attempt(clientIp: string | null, username: string) {
	return { clientIp, username };
}

function createDeferred() {
	let resolve: (value: boolean) => void = () => undefined;
	const promise = new Promise<boolean>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("login rate limit", () => {
	beforeEach(() => {
		resetLoginRateLimitState();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("放行窗口内的尝试，超出后拒绝", () => {
		for (let i = 0; i < IP_MAX_ATTEMPTS_PER_WINDOW; i += 1) {
			expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("allowed");
		}
		expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("rejected");
	});

	it("IP 预算按地址算，换用户名绕不过去——这正是诱饵散列放大的那条 DoS", () => {
		for (let i = 0; i < IP_MAX_ATTEMPTS_PER_WINDOW; i += 1) {
			expect(checkLoginGate(attempt(IP, `ghost-${i}`)).kind).toBe("allowed");
		}
		expect(checkLoginGate(attempt(IP, "ghost-x")).kind).toBe("rejected");
		// 另一个地址不受影响：这一维只按来源分摊，不是全局开关。
		expect(checkLoginGate(attempt(OTHER_IP, "ghost-x")).kind).toBe("allowed");
	});

	it("窗口滑过之后重新放行", () => {
		for (let i = 0; i < IP_MAX_ATTEMPTS_PER_WINDOW; i += 1) {
			checkLoginGate(attempt(IP, "alice"));
		}
		expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("rejected");
		vi.advanceTimersByTime(61_000);
		expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("allowed");
	});

	it("连续失败到阈值后退避，退避期满自动解除", () => {
		for (let i = 0; i < BACKOFF_AFTER_FAILURES; i += 1) {
			expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("allowed");
			recordLoginFailure(attempt(IP, "alice"));
		}
		const decision = checkLoginGate(attempt(IP, "alice"));
		expect(decision).toEqual({
			kind: "rejected",
			retryAfterSeconds: BACKOFF_BASE_SECONDS,
		});
		// 退避只锁 (IP, 用户名)：同一地址换个账号仍能登，否则一个人连错五次
		// 就把整个办公网的其他人一起锁在门外。
		expect(checkLoginGate(attempt(IP, "bob")).kind).toBe("allowed");
		vi.advanceTimersByTime(BACKOFF_BASE_SECONDS * 1000);
		expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("allowed");
	});

	it("退避按失败次数翻倍", () => {
		for (let i = 0; i < BACKOFF_AFTER_FAILURES + 1; i += 1) {
			recordLoginFailure(attempt(IP, "alice"));
		}
		expect(checkLoginGate(attempt(IP, "alice"))).toEqual({
			kind: "rejected",
			retryAfterSeconds: BACKOFF_BASE_SECONDS * 2,
		});
	});

	it("大小写变换不能重置退避", () => {
		for (let i = 0; i < BACKOFF_AFTER_FAILURES; i += 1) {
			recordLoginFailure(attempt(IP, "alice"));
		}
		expect(checkLoginGate(attempt(IP, "ALICE")).kind).toBe("rejected");
	});

	it("登录成功清空该账号的失败计数", () => {
		for (let i = 0; i < BACKOFF_AFTER_FAILURES - 1; i += 1) {
			recordLoginFailure(attempt(IP, "alice"));
		}
		recordLoginSuccess(attempt(IP, "alice"));
		for (let i = 0; i < BACKOFF_AFTER_FAILURES - 1; i += 1) {
			recordLoginFailure(attempt(IP, "alice"));
		}
		expect(checkLoginGate(attempt(IP, "alice")).kind).toBe("allowed");
	});

	it("取不到来源地址时仍按用户名退避", () => {
		for (let i = 0; i < BACKOFF_AFTER_FAILURES; i += 1) {
			recordLoginFailure(attempt(null, "alice"));
		}
		expect(checkLoginGate(attempt(null, "alice")).kind).toBe("rejected");
		expect(checkLoginGate(attempt(null, "bob")).kind).toBe("allowed");
	});
});

describe("verification slot", () => {
	beforeEach(() => {
		resetLoginRateLimitState();
	});

	it("并发位占满时直接回 saturated，释放后恢复", async () => {
		const first = createDeferred();
		const second = createDeferred();
		const firstRun = runInVerificationSlot(() => first.promise);
		const secondRun = runInVerificationSlot(() => second.promise);

		const third = await runInVerificationSlot(() => Promise.resolve(true));
		expect(third.kind).toBe("saturated");

		first.resolve(true);
		second.resolve(false);
		await expect(firstRun).resolves.toEqual({ kind: "ran", value: true });
		await expect(secondRun).resolves.toEqual({ kind: "ran", value: false });

		const fourth = await runInVerificationSlot(() => Promise.resolve(true));
		expect(fourth).toEqual({ kind: "ran", value: true });
	});

	it("被测函数抛错也要把位子还回去", async () => {
		await expect(
			runInVerificationSlot(() => Promise.reject(new Error("boom")))
		).rejects.toThrow("boom");
		const next = await runInVerificationSlot(() => Promise.resolve(true));
		expect(next).toEqual({ kind: "ran", value: true });
	});
});
