import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../settings-fixtures";
import { createReconcileScheduler } from "./reconcile-scheduler";
import { eventOrganization, handleCasdoorWebhook } from "./webhook";

const WEBHOOK_SECRET = "webhook-secret-value-0123456789abcdef";
const DEBOUNCE_MS = 2000;

const settings = effectiveSettings({
	organization: "automationstack",
	provider: "casdoor",
	webhookSecret: { present: true, value: WEBHOOK_SECRET },
});

const roleEvent = JSON.stringify({
	action: "update-role",
	object: '{"owner":"automationstack","users":["automationstack/alice"]}',
	organization: "built-in",
	requestUri: "/api/update-role?id=automationstack/automationstack-admin",
});

function call(
	secretHeader: string | null,
	overrides = {},
	rawBody = roleEvent
) {
	const triggerReconcile = vi.fn();
	const outcome = handleCasdoorWebhook({
		rawBody,
		secretHeader,
		settings: { ...settings, ...overrides },
		triggerReconcile,
	});
	return { outcome, triggerReconcile };
}

describe("handleCasdoorWebhook（T11）", () => {
	it.each([
		["缺少密钥", null, {}],
		["空密钥", "", {}],
		["错误的密钥", "wrong", {}],
		["密钥多一个字符", `${WEBHOOK_SECRET}x`, {}],
		[
			"没有配置 webhook 密钥（一律拒绝）",
			WEBHOOK_SECRET,
			{ webhookSecret: { present: false, value: null } },
		],
	])("%s：unauthorized，不触发对账", async (_name, header, overrides) => {
		const { outcome, triggerReconcile } = call(header, overrides);
		await expect(outcome).resolves.toBe("unauthorized");
		expect(triggerReconcile).not.toHaveBeenCalled();
	});

	it.each([
		["密钥正确：accepted，触发一次对账", {}, roleEvent, ["accepted", 1]],
		[
			"local 模式：ignored，不对账",
			{ provider: "local" },
			roleEvent,
			["ignored", 0],
		],
		[
			"其他组织的对象：ignored（按对象的组织，不按操作人的组织）",
			{},
			JSON.stringify({
				organization: "automationstack",
				requestUri: "/api/update-user?id=built-in/admin",
			}),
			["ignored", 0],
		],
		[
			"请求体不能解析：仍然触发对账（只少授权，所以多对账一次没有风险）",
			{},
			"not json",
			["accepted", 1],
		],
	] as const)("%s", async (_name, overrides, body, [expected, reconciles]) => {
		const { outcome, triggerReconcile } = call(WEBHOOK_SECRET, overrides, body);
		await expect(outcome).resolves.toBe(expected);
		expect(triggerReconcile).toHaveBeenCalledTimes(reconciles);
	});
});

describe("eventOrganization", () => {
	it("requestUri 中的 id 优先，其次是 object.owner", () => {
		expect(eventOrganization(roleEvent)).toBe("automationstack");
		expect(
			eventOrganization(
				JSON.stringify({
					object: '{"owner":"automationstack","name":"carol"}',
					requestUri: "/api/add-user",
				})
			)
		).toBe("automationstack");
		expect(eventOrganization("{}")).toBeNull();
	});
});

/** 对账一直进行中，直到调用 finish。 */
function pendingScheduler() {
	let resolveRun: () => void = () => undefined;
	const run = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				resolveRun = resolve;
			})
	);
	const scheduler = createReconcileScheduler({ debounceMs: DEBOUNCE_MS, run });
	return { finish: () => resolveRun(), run, scheduler };
}

describe("webhook + 调度器：连续事件合并为一次对账", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("三个事件在等待时间内到达：只对账一次", async () => {
		const run = vi.fn(() => Promise.resolve());
		const scheduler = createReconcileScheduler({
			debounceMs: DEBOUNCE_MS,
			run,
		});
		for (let index = 0; index < 3; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 模拟依次到达的事件
			await handleCasdoorWebhook({
				rawBody: roleEvent,
				secretHeader: WEBHOOK_SECRET,
				settings,
				triggerReconcile: scheduler.trigger,
			});
		}
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("对账进行中又到达事件：结束后再对账一次", async () => {
		const { finish, run, scheduler } = pendingScheduler();
		scheduler.trigger();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		scheduler.trigger();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(run).toHaveBeenCalledTimes(1);
		finish();
		await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("runNow：已经在对账时不重复执行", async () => {
		const { finish, run, scheduler } = pendingScheduler();
		const first = scheduler.runNow();
		await scheduler.runNow();
		finish();
		await first;
		expect(run).toHaveBeenCalledTimes(1);
	});
});
