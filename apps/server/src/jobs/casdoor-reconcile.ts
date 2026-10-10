import { casdoorReconcileScheduler } from "@automationstack/api/auth/casdoor/reconcile";
import { env } from "@automationstack/env/server";
import type { PgBoss } from "pg-boss";

const JOB_NAME = "casdoor-reconcile";

/**
 * Casdoor 定期对账（plan 021 T11a、D13），默认每 10 分钟一次。
 * 任务总是注册；不是 casdoor 模式时，对账直接跳过。所以页面切换认证方式后不需要重启。
 */
export async function registerCasdoorReconcile(boss: PgBoss): Promise<void> {
	await boss.createQueue(JOB_NAME);
	await boss.schedule(JOB_NAME, env.CASDOOR_RECONCILE_CRON);
	await boss.work(JOB_NAME, () => casdoorReconcileScheduler.runNow());
}
