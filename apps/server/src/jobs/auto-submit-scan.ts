import { settleAutoSubmitAll } from "@automationstack/db/repositories/test-run-auto-submit-repository";
import { env } from "@automationstack/env/server";
import type { PgBoss } from "pg-boss";

const JOB_NAME = "test-run-auto-submit-scan";

const LOGGED_ID_LIMIT = 10;

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

export async function registerAutoSubmitScan(boss: PgBoss): Promise<void> {
	await boss.createQueue(JOB_NAME);
	await boss.schedule(JOB_NAME, env.AUTO_SUBMIT_SCAN_CRON, undefined, {
		tz: env.AUTO_SUBMIT_SCAN_TZ,
	});
	await boss.work(JOB_NAME, handleAutoSubmitScan);
}
