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

/**
 * 以前的 Casdoor 对账任务的定时计划还在 pgboss schema 中。删除它，
 * 否则 pg-boss 继续为没有 worker 的队列创建任务（ADR 0008）。
 */
const LEGACY_SCHEDULES = ["casdoor-reconcile"] as const;

async function removeLegacySchedules(instance: PgBoss): Promise<void> {
	for (const name of LEGACY_SCHEDULES) {
		try {
			// 先查再删：unschedule 对不存在的计划会抛错。直接删的话，从未用过
			// Casdoor 的安装每次启动都会打一条「删除失败」的假告警。
			// biome-ignore lint/performance/noAwaitInLoops: 只有一项，按顺序处理
			const schedules = await instance.getSchedules(name);
			if (schedules.length === 0) {
				continue;
			}
			await instance.unschedule(name);
		} catch (error) {
			console.warn(`删除旧的定时任务「${name}」失败：`, error);
		}
	}
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
		await removeLegacySchedules(instance);
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
