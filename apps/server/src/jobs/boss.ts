import { env } from "@automationstack/env/server";
import { PgBoss } from "pg-boss";

import { registerAutoSubmitScan } from "./auto-submit-scan";

let boss: PgBoss | null = null;

/**
 * 启动 pg-boss 并注册全部后台任务。
 *
 * 建表走它自己的 `pgboss` schema，`start()` 自动迁移（plan 011 D4），
 * 不进 drizzle migrations，drizzle schema 目录不感知它。
 *
 * 启动失败只记日志并吞掉：后台任务挂了不该拖死 HTTP 服务，
 * 与 R2 缺配置时的降级姿势一致。重复调用是幂等的（已启动则直接返回）。
 */
export async function startJobs(): Promise<void> {
	if (boss) {
		return;
	}
	try {
		const instance = new PgBoss({
			connectionString: env.DATABASE_URL,
			schema: "pgboss",
		});
		await instance.start();
		await registerAutoSubmitScan(instance);
		boss = instance;
		console.log('pg-boss 后台任务已启动（schema "pgboss"）');
	} catch (error) {
		console.error("pg-boss 启动失败，后台任务本次不可用：", error);
	}
}

/**
 * 停掉 pg-boss（优雅退出时调用）。幂等，可安全重复调用；
 * 不等待停止完成——进程退出语境下尽力而为即可。
 */
export function stopJobs(): void {
	if (!boss) {
		return;
	}
	const instance = boss;
	boss = null;
	// stop() 内部会等待在跑的 job 收尾，这里不 await：退出语境下尽力而为。
	// catch 兜住了 rejection，不会再产生未处理 Promise。
	instance.stop().catch((error: unknown) => {
		console.error("pg-boss 停止失败：", error);
	});
}
