/**
 * 测试任务的两条时间线查询，拆出来单独一个文件、再 spread 回 `testRunsRouter`。
 *
 * 拆分的直接原因是 `test-runs.ts` 顶到了 300 行的上限（`scripts/check-file-rules.js`）；
 * 挑这两条走，是因为它们是那个文件里唯一一组**只读、无状态机、无失效广播**的过程，
 * 拿走之后剩下的全是「改测试任务状态」，反倒比原来更像一个文件。
 *
 * 两条的授权口子不同：`listEvents` 是任务级（`runId`），`listCaseEvents` 是执行行级
 * （`runCaseId`），各自用对应的中间件解析归属，见 `../lib/project-scope.ts`。
 */

import { listTestRunCaseEvents } from "@automationstack/db/repositories/test-run-case-events-repository";
import { listTestRunEvents } from "@automationstack/db/repositories/test-run-status-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRunCaseMember, requireRunMember } from "../lib/project-scope";
import { runIdSchema } from "../schemas/test-run";

/** 本地声明而不是提到 schemas/test-run.ts：与 `jira-defects.ts` 同样的一行，各用各的。 */
const runCaseIdSchema = z.object({ runCaseId: z.uuid() });

export const testRunEventProcedures = {
	/**
	 * 单条用例的结论时间线（谁判的、几点判的、谁打回的、当时写的什么）。
	 *
	 * 返回外形与 `listEvents` 一致（`{ actorName, event }`），前端两处折叠区
	 * 是同一种列表，渲染逻辑共用。
	 */
	listCaseEvents: protectedProcedure
		.input(runCaseIdSchema)
		.use(requireRunCaseMember)
		.handler(({ input }) => listTestRunCaseEvents(input.runCaseId)),
	/** 详情页「变更历史」折叠区，审计用（plan §2.3：它不保护报告）。 */
	listEvents: protectedProcedure
		.input(runIdSchema)
		.use(requireRunMember)
		.handler(({ input }) => listTestRunEvents(input.runId)),
};
