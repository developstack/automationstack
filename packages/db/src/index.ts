import { env } from "@automationstack/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { createPoolConfig } from "./pool-config";
// biome-ignore lint/performance/noNamespaceImport: drizzle 需要完整的 schema 命名空间对象
import * as schema from "./schema";

// 进程内唯一的连接池：drizzle 与 pg-boss（apps/server/src/jobs/boss.ts）共用，
// 每实例连接上限 = DATABASE_POOL_MAX，不再另起第二个池。
export const pool = new Pool(
	createPoolConfig({
		connectionString: env.DATABASE_URL,
		max: env.DATABASE_POOL_MAX,
	})
);

// 必须挂：空闲连接被服务端断开（Postgres 重启等）时 Pool 会发 error，
// 没有监听者 Node 就直接抛未捕获异常、整个进程退出。坏连接已被池丢弃，记日志即可。
pool.on("error", (error) => {
	console.error("Postgres 连接池空闲连接出错：", error);
});

export function createDb() {
	return drizzle({ client: pool, schema });
}

export const db = createDb();
