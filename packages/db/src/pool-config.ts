import type { PoolConfig } from "pg";

// 池满时排队等连接的上限：pg 默认 0 = 无限等，库一卡请求就永远挂着；超时改为显式报错。
export const POOL_CONNECTION_TIMEOUT_MS = 10_000;

// 空闲连接多久还给 Postgres。宿主库与其他应用共用 max_connections，闲时尽快归还。
export const POOL_IDLE_TIMEOUT_MS = 10_000;

export const POOL_APPLICATION_NAME = "automationstack";

export interface PoolSettings {
	connectionString: string;
	max: number;
}

export function createPoolConfig({
	connectionString,
	max,
}: PoolSettings): PoolConfig {
	return {
		application_name: POOL_APPLICATION_NAME,
		connectionString,
		connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
		idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
		max,
	};
}
