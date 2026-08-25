import { settleAutoSubmitAll } from "@automationstack/db/repositories/test-run-auto-submit-repository";
import { env } from "@automationstack/env/server";
import type { PgBoss } from "pg-boss";

/** 每日自动提交扫描的 job 名（plan 011 D1：全局扫描，不是每任务一个 job）。 */
const JOB_NAME = "test-run-auto-submit-scan";

/**
 * 日志里最多列几条 id。首次上线时历史积压可能一次命中几百条，
 * 全量 join 进一行只会把日志刷没用；数量才是要看的信息，id 给几个够定位。
 */
const LOGGED_ID_LIMIT = 10;

/**
 * 扫描 handler：全局结算一次「完成后 N 天未提交」。
 *
 * **不得抛出**：捕获后记日志即可——每日兜底扫描失败不该让 job 顶着一串
 * 未处理异常留在队列里，下一天的扫描自然会再试一遍（条件是累积式的，
 * 漏一天不丢数据）。命中才打日志，零命中是常态，刷屏没意义。
 *
 * 代价要写明白：吞掉异常等于 pg-boss 的重试策略完全不参与——队列侧看到的
 * 每次 job 都是 completed，扫描连续失败也只有日志能发现。这是刻意的取舍
 * （见上：次日重扫即可），不是遗漏。
 */
async function handleAutoSubmitScan(): Promise<void> {
	try {
		const ids = await settleAutoSubmitAll();
		if (ids.length > 0) {
			const shown = ids.slice(0, LOGGED_ID_LIMIT).join(", ");
			const omitted =
				ids.length > LOGGED_ID_LIMIT
					? ` 等 ${ids.length - LOGGED_ID_LIMIT} 条（已截断）`
					: "";
			console.log(
				`自动提交扫描命中 ${ids.length} 条测试任务：${shown}${omitted}`
			);
		}
	} catch (error) {
		console.error("自动提交扫描失败：", error);
	}
}

/**
 * 注册每日扫描的调度与 worker。同名重复 schedule 是幂等更新，
 * 每次启动都注册；cron 与时区来自 env（plan 011 D5，时刻仅错峰，
 * 时区需为 IANA 名称——pg-boss 的要求）。
 *
 * 必须先 createQueue：pg-boss v12 的 schedule 表对 queue 表有外键，
 * 队列不存在时 schedule 会报 23503；create_queue 内部 ON CONFLICT DO
 * NOTHING，重复启动幂等。
 */
export async function registerAutoSubmitScan(boss: PgBoss): Promise<void> {
	await boss.createQueue(JOB_NAME);
	await boss.schedule(JOB_NAME, env.AUTO_SUBMIT_SCAN_CRON, undefined, {
		tz: env.AUTO_SUBMIT_SCAN_TZ,
	});
	await boss.work(JOB_NAME, handleAutoSubmitScan);
}
