import { env } from "@automationstack/env/server";
import { PgBoss } from "pg-boss";

import { registerAutoSubmitScan } from "./auto-submit-scan";

let boss: PgBoss | null = null;

export type JobsStatus = "failed" | "running" | "starting" | "stopped";

let status: JobsStatus = "stopped";

export function getJobsStatus(): JobsStatus {
	return status;
}

/**
 * pg-boss 自建 pg.Pool（与 packages/db 的 drizzle 池是两套连接）。不设 max
 * 会走 pg 默认的 10，为一个每天跑一次的扫描白占十条连接；两条足够
 * （一条给 worker/maintenance 轮询，一条给并发的 cron 写入）。
 */
const BOSS_POOL_MAX = 2;

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
			connectionString: env.DATABASE_URL,
			max: BOSS_POOL_MAX,
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
