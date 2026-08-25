import { describe, expect, it } from "vitest";

import {
	deriveBatchIdempotencyKey,
	resolveRunIdempotencyKey,
} from "./idempotency";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RUN_KEY = "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8";

describe("幂等键（§7.2 第 2 条）", () => {
	it("没配环境变量时一次进程生成一个 UUID", () => {
		const first = resolveRunIdempotencyKey({});
		const second = resolveRunIdempotencyKey({});
		expect(first).toMatch(UUID_PATTERN);
		// 两次「进程启动」当然不同——同一次进程内复用的是 config 里存下来的那一个，
		// 由 reporter-client 的测试守着。
		expect(first).not.toBe(second);
	});

	it("AS_IDEMPOTENCY_KEY 让 CI 重试（新进程）也能复用同一个键", () => {
		const env = { AS_IDEMPOTENCY_KEY: RUN_KEY };
		expect(resolveRunIdempotencyKey(env)).toBe(RUN_KEY);
		expect(resolveRunIdempotencyKey(env)).toBe(RUN_KEY);
	});

	it("第 0 批直接用 run key，人在日志里看到的就是它", () => {
		expect(deriveBatchIdempotencyKey(RUN_KEY, 0)).toBe(RUN_KEY);
	});

	it("派生是确定性的——重试第 N 批算出来的还是同一个键", () => {
		expect(deriveBatchIdempotencyKey(RUN_KEY, 3)).toBe(
			deriveBatchIdempotencyKey(RUN_KEY, 3)
		);
	});

	it("不同批派生出不同的键，否则第二批会命中第一批的缓存对账单", () => {
		const keys = [0, 1, 2, 3].map((index) =>
			deriveBatchIdempotencyKey(RUN_KEY, index)
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("派生出来的必须是合法 UUID，服务端的 z.uuid() 只认这个", () => {
		for (const index of [1, 2, 7, 99]) {
			expect(deriveBatchIdempotencyKey(RUN_KEY, index)).toMatch(UUID_PATTERN);
		}
	});
});
