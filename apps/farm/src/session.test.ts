import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionRegistry, type SessionRegistry } from "./scheduler";
import {
	createLiveSession,
	type LiveSession,
	type LiveSessionInit,
	type SessionExpiryReason,
} from "./session";

/**
 * 状态机与配额闸门的用例。
 *
 * 这一层的失效方式在真环境里**极难复现**：计时器没重置要等两分钟才看得出来，
 * 收尾被走两遍要恰好撞上一次并发。所以它们全部在这里用假时钟钉死，真容器上只
 * 验证 happy path。
 */

const IDLE_MS = 120_000;
const LIFETIME_MS = 1_800_000;

interface Expiry {
	reason: SessionExpiryReason;
	sessionId: string;
}

function makeSession(
	overrides: Partial<LiveSessionInit> = {},
	expiries: Expiry[] = []
): LiveSession {
	return createLiveSession({
		browser: "chromium",
		id: "session-1",
		idleTimeoutMs: IDLE_MS,
		image: "browser:latest",
		maxLifetimeMs: LIFETIME_MS,
		onExpired: (session, reason) => {
			expiries.push({ reason, sessionId: session.id });
		},
		projectId: "project-1",
		protocol: "webdriver",
		version: "latest",
		workDir: "/tmp/farm/session-1",
		...overrides,
	});
}

describe("LiveSession 状态迁移", () => {
	it("初始是 starting，markRunning 之后是 running", () => {
		const session = makeSession();
		expect(session.state()).toBe("starting");
		session.markRunning();
		expect(session.state()).toBe("running");
	});

	it("beginFinishing 只有第一个调用方拿到 true", () => {
		const session = makeSession();
		session.markRunning();
		expect(session.beginFinishing()).toBe(true);
		expect(session.beginFinishing()).toBe(false);
		expect(session.state()).toBe("finishing");
	});

	it("收尾开始后 markRunning 是空操作，状态不会倒退", () => {
		const session = makeSession();
		session.markRunning();
		session.beginFinishing();
		session.markRunning();
		expect(session.state()).toBe("finishing");
	});

	it("settle 之后不能再被收尾", () => {
		const session = makeSession();
		session.beginFinishing();
		session.settle();
		expect(session.state()).toBe("settled");
		expect(session.beginFinishing()).toBe(false);
	});
});

describe("statusReason 拼接", () => {
	it("按出现顺序拼接，不覆盖已有的", () => {
		const session = makeSession();
		session.addStatusReason("idle_timeout");
		session.addStatusReason("artifacts_upload_failed");
		expect(session.statusReason()).toBe("idle_timeout,artifacts_upload_failed");
	});

	it("重复的同一条只记一次", () => {
		const session = makeSession();
		session.addStatusReason("killed_by_operator");
		session.addStatusReason("killed_by_operator");
		expect(session.statusReason()).toBe("killed_by_operator");
	});

	it("一条都没有时是 null 而不是空串", () => {
		expect(makeSession().statusReason()).toBeNull();
	});
});

describe("超时计时器", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("running 之后闲置到点触发 idle_timeout", () => {
		const expiries: Expiry[] = [];
		const session = makeSession({}, expiries);
		session.markRunning();
		vi.advanceTimersByTime(IDLE_MS - 1);
		expect(expiries).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(expiries).toEqual([
			{ reason: "idle_timeout", sessionId: "session-1" },
		]);
	});

	it("每次 touch 都把空闲计时器推后（不是从建会话起算）", () => {
		const expiries: Expiry[] = [];
		const session = makeSession({}, expiries);
		session.markRunning();
		for (let i = 0; i < 5; i += 1) {
			vi.advanceTimersByTime(IDLE_MS - 1000);
			session.touch();
		}
		expect(expiries).toHaveLength(0);
		vi.advanceTimersByTime(IDLE_MS);
		expect(expiries).toHaveLength(1);
	});

	it("CDP 会话不设空闲超时", () => {
		const expiries: Expiry[] = [];
		const session = makeSession(
			{ idleTimeoutMs: null, protocol: "cdp" },
			expiries
		);
		session.markRunning();
		vi.advanceTimersByTime(IDLE_MS * 10);
		expect(expiries).toHaveLength(0);
	});

	it("寿命计时器从建会话起算，卡在 starting 的会话也会被收掉", () => {
		const expiries: Expiry[] = [];
		makeSession({}, expiries);
		vi.advanceTimersByTime(LIFETIME_MS);
		expect(expiries).toEqual([
			{ reason: "max_lifetime", sessionId: "session-1" },
		]);
	});

	it("收尾开始后两个计时器都不再触发", () => {
		const expiries: Expiry[] = [];
		const session = makeSession({}, expiries);
		session.markRunning();
		session.beginFinishing();
		vi.advanceTimersByTime(LIFETIME_MS * 2);
		expect(expiries).toHaveLength(0);
	});

	it("touch 在 running 之外不重启计时器", () => {
		const expiries: Expiry[] = [];
		const session = makeSession({}, expiries);
		// 还在 starting：touch 不该悄悄把空闲计时器开起来。
		session.touch();
		vi.advanceTimersByTime(IDLE_MS * 2);
		expect(expiries.map((item) => item.reason)).not.toContain("idle_timeout");
	});
});

/**
 * 按「最多几条会话」建一个注册表。
 *
 * 闸门本身已经不认识数字了（它只问 `hasFreeSlot`，见 scheduler.ts），
 * 这里用一个数着自己的闭包把旧口径还原出来，好让下面几条断言继续钉的是
 * 闸门的行为而不是容量从哪来。
 */
function registryWithCapacity(capacity: number): SessionRegistry {
	const registry: SessionRegistry = createSessionRegistry({
		hasFreeSlot: () => registry.size() < capacity,
	});
	return registry;
}

describe("配额闸门", () => {
	it("未开闸时一律拒绝（启动对账期 / 关停期）", () => {
		const registry = registryWithCapacity(2);
		expect(registry.admit().kind).toBe("rejected");
	});

	it("开闸后到上限为止接受，之后带 Retry-After 拒绝", () => {
		const registry = registryWithCapacity(2);
		registry.openIntake();
		registry.register(makeSession({ id: "a" }));
		expect(registry.admit().kind).toBe("accepted");
		registry.register(makeSession({ id: "b" }));
		const rejected = registry.admit();
		expect(rejected.kind).toBe("rejected");
		if (rejected.kind === "rejected") {
			expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it("摘除一条之后槽位立刻回来", () => {
		const registry = registryWithCapacity(1);
		registry.openIntake();
		registry.register(makeSession({ id: "a" }));
		expect(registry.admit().kind).toBe("rejected");
		registry.remove("a");
		expect(registry.size()).toBe(0);
		expect(registry.admit().kind).toBe("accepted");
	});

	it("closeIntake 不影响已有会话，只挡新的", () => {
		const registry = registryWithCapacity(4);
		registry.openIntake();
		registry.register(makeSession({ id: "a" }));
		registry.closeIntake();
		expect(registry.admit().kind).toBe("rejected");
		expect(registry.get("a")).toBeDefined();
		expect(registry.list()).toHaveLength(1);
	});
});
