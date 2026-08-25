import { env } from "@automationstack/env/server";
import { PgBoss } from "pg-boss";

import { registerAutoSubmitScan } from "./auto-submit-scan";

let boss: PgBoss | null = null;

/**
 * 后台任务的生命周期状态。存在的理由是**可观测性**：`startJobs()` 失败只被吞成
 * 一行 console.error，之后服务一切正常、接口全绿，而每日扫描已经永远不跑了。
 * 把状态摊出来，`/health` 才有东西可报（见 `apps/server/src/index.ts`）。
 */
export type JobsStatus = "failed" | "running" | "starting" | "stopped";

let status: JobsStatus = "stopped";

/** 后台任务当前状态。供健康检查读取，不做任何副作用。 */
export function getJobsStatus(): JobsStatus {
	return status;
}

/**
 * pg-boss 自建 pg.Pool（与 packages/db 的 drizzle 池是两套连接）。不设 max
 * 会走 pg 默认的 10，为一个每天跑一次的扫描白占十条连接；两条足够
 * （一条给 worker/maintenance 轮询，一条给并发的 cron 写入）。
 */
const BOSS_POOL_MAX = 2;

/** 退出时等待 pg-boss 收尾的上限，超时就不等了——退出不该被后台任务拖住。 */
const STOP_TIMEOUT_MS = 5000;

/**
 * 挂 error / warning 监听。
 *
 * **必须挂**，而且必须在 `start()` 之前：`PgBoss` 继承 EventEmitter，构造时把
 * 内部所有子系统（db 连接池、timekeeper 的 cron 轮询、manager 的维护循环）的
 * 事件全部上抛到自己身上，而 Node 对没有监听者的 `error` 事件的处理是直接
 * throw —— 未捕获异常，整个进程退出。Postgres 重启一次触发的空闲连接错误
 * 就够了，这是常态故障而非理论风险。
 *
 * 换句话说：没有这个监听，下面 try/catch 兜住的只是 `start()` 那一瞬间，
 * 运行期的任何一次抖动都会把 HTTP 服务一起带走，与本模块「后台任务挂了不该
 * 拖死 HTTP 服务」的意图正好相反。
 */
function attachEventLogging(instance: PgBoss): void {
	instance.on("error", (error) => {
		console.error("pg-boss 运行时错误：", error);
	});
	instance.on("warning", (warning) => {
		console.warn("pg-boss 告警：", warning);
	});
}

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
		// start() 成功但注册失败（最现实的触发点：cron / 时区配错，schedule 当场抛）
		// 时，实例的连接池与 cron、维护定时器都已经在跑，而 `boss` 还是 null——
		// 不在这里收掉，它就永远够不着了，重试 startJobs 还会再起一个。
		await instance?.stop({ graceful: false }).catch(() => {
			// 清理失败没有下一步可做，出错信息已由 error 监听打出。
		});
	}
}

/**
 * 停掉 pg-boss（优雅退出时调用）。幂等，可安全重复调用。
 *
 * 必须被 await：`stop()` 内部第一步就是 await，调用方若不等就 `process.exit()`，
 * 它连第一个 await 都恢复不到——in-flight 的 job 会以 active 状态留在表里等
 * 超时回收，连接也不会关。这里给一个上限，超时了就随进程一起走。
 */
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
