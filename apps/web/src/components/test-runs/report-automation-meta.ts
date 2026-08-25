/**
 * 报告页「自动化执行记录」块与「越界用例」块的展示元数据与纯函数。
 *
 * 与 `report-meta.ts` 分开成文件，是因为这两块的取值口径有一条**只在这里成立**
 * 的硬规矩：条数一律是**本任务**的条数（plan §6.3）。把它和别的展示常量混在
 * 一处，早晚会有人顺手从别的地方拿一个「看起来也是条数」的字段填进来。
 */
import type { AppRouterClient } from "@automationstack/api/routers/index";

type TestRunReportView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["report"]>
>;

/**
 * 一次脚本上报在**本任务**里的样子。
 *
 * ⚠️ `updatedCount` / `skippedCount` 是后端按 `test_run_cases` 现算的本任务条数，
 * **不是** `automation_executions` 上那两个跨任务全局计数（§3.2 / §6.3）。
 * 一次执行可能同时写进多个测试任务，全局计数直接显示就会让「刷新 80 条」
 * 出现在一个总共才 40 条用例的报告里——不报错，只是静默地数错。
 */
export type ReportAutomationExecution =
	TestRunReportView["automationExecutions"][number];

export type ReportOutOfScopeCase = TestRunReportView["outOfScopeCases"][number];

/**
 * commit 短 hash 取几位。
 *
 * 7 位是 git 自己 `--short` 的默认宽度，也是所有人从 CI 日志里认得出来的那个长度。
 * 全长 40 位在表格里会把「刷新 / 跳过」两列挤没，而读报告的人拿这一列只做两件事：
 * 认出「哦是这版」，以及点进 CI。真要复制全长，`title` 里挂着。
 */
const SHORT_COMMIT_LENGTH = 7;

/** 没有 commit（本机跑、SDK 没报）时返回 null，由调用方决定怎么显示占位。 */
export function formatCommitShort(commitSha: string | null): string | null {
	if (commitSha === null || commitSha === "") {
		return null;
	}
	return commitSha.slice(0, SHORT_COMMIT_LENGTH);
}

/**
 * 一行执行记录的文字等价物：「刷新 79 条，跳过 1 条」。
 *
 * 表格里两个数字分列两格，读屏念出来是两个孤零零的数；这一句给读屏和
 * 窄屏用，措辞与 plan §6.3 的示例逐字对齐。
 *
 * **跳过为 0 时也照说**（「跳过 0 条」），不省略：这一块存在的唯一理由就是
 * §2.2 那个风险——「张三以为 80 条都刷新了，实际 12 条被跳过而他不知道」。
 * 省略掉 0 会让「没有跳过」和「这一版还没实现跳过统计」看起来一模一样。
 */
export function formatExecutionCounts(
	execution: Pick<ReportAutomationExecution, "skippedCount" | "updatedCount">
): string {
	return `刷新 ${execution.updatedCount} 条，跳过 ${execution.skippedCount} 条`;
}

/**
 * 这一轮跑完了没有。
 *
 * `completedAt` 是服务端把这一轮全部写完才落的（§5.5），null 就是「没跑完」：
 * 进程被杀、事务回滚都会留下这样一行。它下面那两个条数只是「跑到一半写进去的
 * 部分」，所以界面必须标出来，不能当成完整的一轮展示（§6.3 的硬要求）。
 */
export function isExecutionIncomplete(
	execution: Pick<ReportAutomationExecution, "completedAt">
): boolean {
	return execution.completedAt === null;
}
