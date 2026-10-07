import { pool } from "@automationstack/db";
import { type Db, PgBoss } from "pg-boss";

import { registerAutoSubmitScan } from "./auto-submit-scan";

let boss: PgBoss | null = null;

export type JobsStatus = "failed" | "running" | "starting" | "stopped";

let status: JobsStatus = "stopped";

export function getJobsStatus(): JobsStatus {
	return status;
}

// 让 pg-boss 走 drizzle 那个进程唯一的连接池，而不是自建第二个 pg.Pool。
// 等价于 pg-boss 内置 Db.executeSql（同样是 pool.query）；useListenNotify 默认关，
// 不会另开常驻 LISTEN 连接。pg-boss 只在自建池时才在 stop() 里关池，共用池不会被它关掉。
export const sharedPoolDb: Db = {
	executeSql: (text, values) => pool.query(text, values),
};

const STOP_TIMEOUT_MS = 5000;

function attachEventLogging(instance: PgBoss): void {
	instance.on("error", (error) => {
		console.error("pg-boss 运行时错误：", error);
	});
	instance.on("warning", (warning) => {
		console.warn("pg-boss 告警：", warning);
	});
}

export async function startJobs(): Promise<void> {
	if (boss) {
		return;
	}
	let instance: PgBoss | null = null;
	status = "starting";
	try {
		instance = new PgBoss({
			db: sharedPoolDb,
			schema: "pgboss",
		});
		attachEventLogging(instance);
		await instance.start();
		await registerAutoSubmitScan(instance);
		boss = instance;
		status = "running";
		console.log('pg-boss 后台任务已启动（schema "pgboss"）');
	} catch (error) {
		status = "failed";
		console.error("pg-boss 启动失败，后台任务本次不可用：", error);
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
		await instance?.stop({ graceful: false }).catch(() => {});
	}
}

export async function stopJobs(): Promise<void> {
	if (!boss) {
		return;
	}
	const instance = boss;
	boss = null;
	status = "stopped";
	try {
		await instance.stop({ timeout: STOP_TIMEOUT_MS });
	} catch (error) {
		console.error("pg-boss 停止失败：", error);
	}
}
