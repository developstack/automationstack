import { expect, test } from "vitest";

import {
	createPoolConfig,
	POOL_CONNECTION_TIMEOUT_MS,
	POOL_IDLE_TIMEOUT_MS,
} from "./pool-config";

const URL = "postgresql://user:pass@localhost:5432/app";

test("连接上限取自传入的 max，不落回 pg 默认的 10", () => {
	const config = createPoolConfig({ connectionString: URL, max: 3 });
	expect(config.max).toBe(3);
	expect(config.connectionString).toBe(URL);
});

test("池满排队有超时、空闲连接会归还，避免挂死与长期占连接", () => {
	const config = createPoolConfig({ connectionString: URL, max: 5 });
	expect(config.connectionTimeoutMillis).toBe(POOL_CONNECTION_TIMEOUT_MS);
	expect(POOL_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
	expect(config.idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
	expect(POOL_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
});

test("带 application_name，便于在共享库的 pg_stat_activity 里认出本应用的连接", () => {
	const config = createPoolConfig({ connectionString: URL, max: 5 });
	expect(config.application_name).toBe("automationstack");
});
