import { getTestRunDetail } from "@automationstack/db/repositories/test-run-detail-repository";
import {
	createTestRun,
	createTestRunFromFailed,
	updateTestRun,
} from "@automationstack/db/repositories/test-run-mutations-repository";
import { getTestRunReport } from "@automationstack/db/repositories/test-run-report-repository";
import {
	markTestRunReviewed,
	submitTestRun,
	unmarkTestRunReviewed,
} from "@automationstack/db/repositories/test-run-transitions-repository";
import { listTestRuns } from "@automationstack/db/repositories/test-runs-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { requireRunMember } from "../lib/project-scope";
import { getR2Storage } from "../lib/r2";
import { publishInvalidate } from "../lib/realtime-publish";
import { withDownloadUrls } from "../lib/run-attachment-urls";
import { rejectRunWrite, testRunErrors } from "../lib/test-run-errors";
import { runIdSchema, testRunStatusSchema } from "../schemas/test-run";
import { testRunEventProcedures } from "./test-run-events";
import { testRunExecutionProcedures } from "./test-run-execution";
import { testRunStepExecutionProcedures } from "./test-run-step-execution";
import { testRunVoidProcedures } from "./test-run-void";

const listTestRunsSchema = z.object({
	keyword: z.string().optional(),
	projectId: z.uuid(),
	status: testRunStatusSchema.optional(),
});

const createTestRunSchema = z.object({
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

const createFromFailedSchema = z.object({
	description: z.string().nullable().optional(),
	name: z.string().min(1),
	sourceRunId: z.uuid(),
});

const toSourceRunScope = (input: { sourceRunId: string }) => ({
	runId: input.sourceRunId,
});

export const testRunsRouter = {
	...testRunEventProcedures,
	...testRunExecutionProcedures,
	...testRunStepExecutionProcedures,
	...testRunVoidProcedures,
	create: protectedProcedure
		.errors(testRunErrors)
		.input(createTestRunSchema)
		.use(requireProjectMember)
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
	createFromFailed: protectedProcedure
		.errors(testRunErrors)
		.input(createFromFailedSchema)
		.use(requireRunMember, toSourceRunScope)
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
		.use(requireRunMember)
		.handler(async ({ errors, input }) => {
			const detail = await getTestRunDetail(input.runId);
			if (!detail) {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			return detail;
		}),
	list: protectedProcedure
		.input(listTestRunsSchema)
		.use(requireProjectMember)
		.handler(({ input }) =>
			listTestRuns(input.projectId, {
				keyword: input.keyword,
				status: input.status,
			})
		),
	markReviewed: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.use(requireRunMember)
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
	report: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(runIdSchema)
		.use(requireRunMember)
		.handler(async ({ errors, input }) => {
			const report = await getTestRunReport(input.runId);
			if (!report) {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			// 失败和阻塞用例的附件随报告一起签发下载地址，页面不需要为每条用例另外请求附件列表
			const storage = getR2Storage();
			const failedAndBlockedCases = await Promise.all(
				report.failedAndBlockedCases.map(async (reportCase) => ({
					...reportCase,
					attachments: await withDownloadUrls(reportCase.attachments, storage),
				}))
			);
			return { ...report, failedAndBlockedCases };
		}),
	submit: protectedProcedure
		.errors(testRunErrors)
		.input(runIdSchema)
		.use(requireRunMember)
		.handler(async ({ context, errors, input }) => {
			const result = await submitTestRun({
				actorId: context.user.id,
				runId: input.runId,
			});
			if (result.kind === "not-found" || result.kind === "voided") {
				rejectRunWrite(result, errors);
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
		.use(requireRunMember)
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
		.use(requireRunMember)
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
