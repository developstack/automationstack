import { voidTestRun } from "@automationstack/db/repositories/test-run-transitions-repository";
import { findTestRun } from "@automationstack/db/repositories/test-runs-repository";

import { protectedProcedure } from "../index";
import { requireRunMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import { canVoidTestRun } from "../lib/test-run-access";
import { rejectRunWrite, testRunErrors } from "../lib/test-run-errors";
import { voidTestRunSchema } from "../schemas/test-run";

const VOID_FORBIDDEN_MESSAGE =
	"只有测试任务的创建者、项目 owner 和平台管理员可以作废测试任务";

export const testRunVoidProcedures = {
	void: protectedProcedure
		.errors({ ...testRunErrors, FORBIDDEN: {} })
		.input(voidTestRunSchema)
		.use(requireRunMember)
		.handler(async ({ context, errors, input }) => {
			const target = await findTestRun(input.runId);
			if (target === null) {
				throw errors.NOT_FOUND({ message: "测试任务不存在" });
			}
			const viewer = { ...context.projectAccess, userId: context.user.id };
			if (!canVoidTestRun(viewer, target.createdBy)) {
				throw errors.FORBIDDEN({ message: VOID_FORBIDDEN_MESSAGE });
			}
			const result = await voidTestRun({
				actorId: context.user.id,
				reason: input.reason,
				runId: input.runId,
			});
			if (result.kind === "invalid-status") {
				throw errors.CONFLICT({
					message: "已完成或已提交的测试任务不能作废",
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
};
