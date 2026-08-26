/** biome-ignore-all lint/suspicious/noConsole: 示例的终端输出就是它的交付物 */

/**
 * §7.2 第 4 条的**手工触发入口**：一条都没写进去时，进程必须非零退出。
 *
 *   pnpm --filter @automationstack/example-nodejs report:empty-write
 *   echo $?          # 1
 *
 * ## 为什么单独一个入口，而不是给主入口加个开关
 *
 * 这条路径的全部价值在于**能被亲眼看到**。藏在 `--force-empty` 之类的开关后面，
 * 就得先有人知道那个开关存在；而知道它存在的人，本来也就不需要被说服。
 * 单独一个 npm script，任何人跑一次就看得见退出码。
 *
 * 它报一条**故意不存在**的 sourceRef：项目里没有这条用例 → `unmatchedCases`
 * 全量落空 → `writtenTo` 为空 → SDK 抛 `IngestEmptyWriteError` 并置退出码。
 * 顺带演示对账单三类拒绝里的「未匹配」——它与「越界」是两件事，
 * 平台从不把它们合并成一句「上报失败」（§5.8）。
 *
 * ⚠️ 服务端这时返回的仍然是 **200**：HTTP 状态码表达「请求本身有没有问题」，
 * 对账单表达「业务上发生了什么」。把「没有任何任务收这批用例」做成 404，
 * SDK 就分不清是路由错了还是业务结果。翻译成非零退出码是 SDK 的职责。
 */

import {
	AutomationStackReporter,
	IngestEmptyWriteError,
} from "@automationstack/sdk";

/**
 * 故意写成一个不可能存在的 sourceRef。
 * 种子脚本**不会**造它——造了这个入口就演示不了任何东西了。
 */
const MISSING_SOURCE_REF = "AUTO-DOES-NOT-EXIST-999";

const DEMO_DURATION_MS = 42;

/** 「示例自己的前提没成立」用 2，与第 4 条那条正常演示路径（1）区分开。 */
const EXIT_PREMISE_BROKEN = 2;

async function main() {
	const reporter = new AutomationStackReporter();
	console.log(
		`[example] 故意上报一条不存在的用例：${MISSING_SOURCE_REF}（幂等键 ${reporter.idempotencyKey}）`
	);
	reporter.addResult({
		durationMs: DEMO_DURATION_MS,
		result: "passed",
		sourceRef: MISSING_SOURCE_REF,
	});
	await reporter.finish();
	// 走到这里说明服务端居然写进去了——那不是「示例通过」，是这个演示的前提没成立。
	console.error(
		"[example] ⚠️ 预期是一条都写不进去，实际却写进去了：请确认演示项目里没有这条 sourceRef"
	);
	process.exit(EXIT_PREMISE_BROKEN);
}

main().catch((error) => {
	if (error instanceof IngestEmptyWriteError) {
		// 这就是要演示的那条路径：对账单已由 SDK 原样打完，这里再把逐条理由打一遍
		// （SDK 把服务端原文带在 message 里），然后非零退出。
		console.error(`[example] 一条都没写进去：\n${error.message}`);
		console.error("[example] 按 §7.2 第 4 条，进程以退出码 1 结束");
		process.exit(1);
	}
	console.error(error);
	process.exit(1);
});
