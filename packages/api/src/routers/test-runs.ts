import { listTestRunCaseEvents } from "@automationstack/db/repositories/test-run-case-events-repository";
import { getTestRunDetail } from "@automationstack/db/repositories/test-run-detail-repository";
import {
	createTestRun,
	createTestRunFromFailed,
	removeTestRun,
	updateTestRun,
} from "@automationstack/db/repositories/test-run-mutations-repository";
import { getTestRunReport } from "@automationstack/db/repositories/test-run-report-repository";
import { listTestRunEvents } from "@automationstack/db/repositories/test-run-status-repository";
import {
	markTestRunReviewed,
	submitTestRun,
	unmarkTestRunReviewed,
} from "@automationstack/db/repositories/test-run-transitions-repository";
import { listTestRuns } from "@automationstack/db/repositories/test-runs-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { publishInvalidate } from "../lib/realtime-publish";
import { rejectRunWrite, testRunErrors } from "../lib/test-run-errors";
import { runIdSchema, testRunStatusSchema } from "../schemas/test-run";
import { testRunExecutionProcedures } from "./test-run-execution";
import { testRunStepExecutionProcedures } from "./test-run-step-execution";

const listTestRunsSchema = z.object({
	keyword: z.string().optional(),
	projectId: z.uuid(),
	status: testRunStatusSchema.optional(),
});

const createTestRunSchema = z.object({
	/**
	 * 至少勾一条。空测试任务会永久卡在 `pending_review` / `ready`（没有用例就没有结论，
	 * 状态推导永远推不动），repository 也会以 `empty-cases` 拒绝——这里先挡一道，
	 * 是为了让错误停在校验层、消息更直白。
	 */
	caseIds: z.array(z.uuid()).min(1),
	description: z.string().nullable().optional(),
	name: z.string().min(1),
	projectId: z.uuid(),
});

const updateTestRunSchema = z.object({
	description: z.string().nullable().optional(),
	name: z.string().min(1).optional(),
	runId: z.uuid(),
});

/** 本地声明而不是提到 schemas/test-run.ts：与 `jira-defects.ts` 同样的一行，各用各的。 */
const runCaseIdSchema = z.object({ runCaseId: z.uuid() });

const createFromFailedSchema = z.object({
	description: z.string().nullable().optional(),
	name: z.string().min(1),
	sourceRunId: z.uuid(),
});

export const testRunsRouter = {
	...testRunExecutionProcedures,
	...testRunStepExecutionProcedures,
	create: protectedProcedure
		.errors(testRunErrors)
		.input(createTestRunSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await createTestRun({
				caseIds: input.caseIds,
				createdBy: context.user.id,
				description: input.description,
				name: input.name,
				projectId: input.projectId,
			});
			if (result.kind === "empty-cases") {
				throw errors.BAD_REQUEST({ message: "请至少勾选一条用例" });
			}
			if (result.kind === "invalid-cases") {
				throw errors.BAD_REQUEST({
					message: `以下用例不存在或不属于该项目：${result.invalidCaseIds.join("、")}`,
				});
			}
			publishInvalidate({
				action: "create",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result.run;
		}),
	/**
	 * D11 的重测任务：从某个测试任务的失败用例新建一个测试任务。
	 * 它同时是 `submitted` 终态唯一的「出路」——已提交的测试任务要继续测，只能从它开重测任务。
	 */
	createFromFailed: protectedProcedure
		.errors(testRunErrors)
		.input(createFromFailedSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await createTestRunFromFailed({
				createdBy: context.user.id,
				description: input.description,
				name: input.name,
				sourceRunId: input.sourceRunId,
			});
			if (result.kind === "source-not-found") {
				throw errors.NOT_FOUND({ message: "源测试任务不存在" });
			}
			// `empty-cases` 在这条路径上进不来（上一步已经拦掉了「没有失败用例」），
			// 但它在 `CreateTestRunResult` 联合里，得有个落点。
			if (result.kind === "no-failed-cases" || result.kind === "empty-cases") {
				throw errors.BAD_REQUEST({ message: "该测试任务没有失败的用例" });
			}
			if (result.kind === "invalid-cases") {
				throw errors.BAD_REQUEST({ message: "源测试任务引用了已失效的用例" });
			}
			publishInvalidate({
				action: "create",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result.run;
		}),
	get: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(runIdSchema)
		.handler(async ({ errors, input }) => {
			const detail = await getTestRunDetail(input.runId);
			if (!detail) {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			return detail;
		}),
	list: protectedProcedure.input(listTestRunsSchema).handler(({ input }) =>
		listTestRuns(input.projectId, {
			keyword: input.keyword,
			status: input.status,
		})
	),
	/**
	 * 单条用例的结论时间线（谁判的、几点判的、谁打回的、当时写的什么）。
	 *
	 * 返回外形与 `listEvents` 一致（`{ actorName, event }`），前端两处折叠区
	 * 是同一种列表，渲染逻辑共用。鉴权同本 router 其余 procedure：
	 * 登录即可见——本期所有登录用户看到同一批项目（见 schema/users.ts）。
	 */
	listCaseEvents: protectedProcedure
		.input(runCaseIdSchema)
		.handler(({ input }) => listTestRunCaseEvents(input.runCaseId)),
	/** 详情页「变更历史」折叠区，审计用（plan §2.3：它不保护报告）。 */
	listEvents: protectedProcedure
		.input(runIdSchema)
		.handler(({ input }) => listTestRunEvents(input.runId)),
	markReviewed: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await markTestRunReviewed({
				actorId: context.user.id,
				runId: input.runId,
			});
			if (result.kind === "invalid-status") {
				throw errors.CONFLICT({
					message: "只有「待评审」的测试任务可以标记评审完成",
				});
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result.run;
		}),
	/** 已提交的测试任务删不掉（返回 CONFLICT）：理由见 `removeTestRun` 的注释。 */
	remove: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await removeTestRun(input.runId);
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "delete",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return { id: result.run.id };
		}),
	report: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(runIdSchema)
		.handler(async ({ errors, input }) => {
			const report = await getTestRunReport(input.runId);
			if (!report) {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			return report;
		}),
	/**
	 * 提交报告：终态，不可逆（D15）。
	 *
	 * 重复提交**不是错误**：第二次返回 `alreadySubmitted: true` 加那份测试任务，
	 * 前端直接切到已提交视图即可（plan §2.5「提交是幂等的」）。
	 * 把它做成 500 只会让用户以为提交失败而反复重试，而重试永远不会成功。
	 */
	submit: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await submitTestRun({
				actorId: context.user.id,
				runId: input.runId,
			});
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			if (result.kind === "invalid-status") {
				throw errors.CONFLICT({
					message: "测试任务尚未完成，不能提交报告",
				});
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return {
				alreadySubmitted: result.kind === "already-submitted",
				run: result.run,
			};
		}),
	unmarkReviewed: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await unmarkTestRunReviewed({
				actorId: context.user.id,
				runId: input.runId,
			});
			if (result.kind === "invalid-status") {
				throw errors.CONFLICT({
					message: "只有「待测试」的测试任务可以撤销评审",
				});
			}
			if (result.kind === "has-results") {
				throw errors.CONFLICT({
					message: `该测试任务已有 ${result.concludedCount} 条结论，不能撤销评审`,
				});
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result.run;
		}),
	update: protectedProcedure
		.errors(testRunErrors)
		.input(updateTestRunSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await updateTestRun(input);
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result.run;
		}),
};
