import { expect, test } from "vitest";

import {
	createPoolConfig,
	POOL_CONNECTION_TIMEOUT_MS,
	POOL_IDLE_TIMEOUT_MS,
} from "./pool-config";

const URL = "postgresql://user:pass@localhost:5432/app";

// 连接上限取自传入的 max，不落回 pg 默认的 10；池满排队有超时、空闲连接会归还，避免挂死与长期占连接；
// 带 application_name，便于在共享库的 pg_stat_activity 里认出本应用的连接
test("createPoolConfig 带上 max、两种超时与 application_name", () => {
	expect(createPoolConfig({ connectionString: URL, max: 3 })).toMatchObject({
		application_name: "automationstack",
		connectionString: URL,
		connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
		idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
		max: 3,
	});
	expect(POOL_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
	expect(POOL_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
});
