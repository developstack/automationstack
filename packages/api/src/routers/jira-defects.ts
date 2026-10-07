import { getDefectContext } from "@automationstack/db/repositories/jira-repository";
import {
	setRunCaseDefect,
	updateDefectStatusByIssueKey,
} from "@automationstack/db/repositories/test-run-defects-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import type { DefectLinkView } from "../lib/jira/defect-link";
import { describeJiraFailure } from "../lib/jira/failure";
import { resolveJiraClient } from "../lib/jira/get-client";
import { requireRunCaseMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import { defectReferenceSchema } from "../schemas/jira";
import { createDefectErrorMap, handleCreateDefect } from "./jira-defect-create";
import { handleLinkDefect, linkDefectErrorMap } from "./jira-defect-link";

const runCaseIdSchema = z.object({ runCaseId: z.uuid() });

export const jiraDefectProcedures = {
	clearDefect: protectedProcedure
		.errors({ CONFLICT: {}, NOT_FOUND: {} })
		.input(runCaseIdSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }): Promise<DefectLinkView> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			if (defect.submittedAt !== null) {
				throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
			}
			const view: DefectLinkView = {
				defectKey: null,
				defectStatus: null,
				defectTitle: null,
				defectUrl: null,
			};
			const written = await setRunCaseDefect(input.runCaseId, view);
			if (written.kind !== "ok") {
				throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [defect.runId],
				projectId: defect.projectId,
			});
			return view;
		}),
	createDefect: protectedProcedure
		.errors(createDefectErrorMap)
		.input(runCaseIdSchema)
		.use(requireRunCaseMember)
		.handler((options): Promise<DefectLinkView> => handleCreateDefect(options)),

	linkDefect: protectedProcedure
		.errors(linkDefectErrorMap)
		.input(
			z.object({
				reference: defectReferenceSchema,
				runCaseId: z.uuid(),
			})
		)
		.use(requireRunCaseMember)
		.handler((options): Promise<DefectLinkView> => handleLinkDefect(options)),

	refreshDefectStatus: protectedProcedure
		.errors({ BAD_GATEWAY: {}, BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(runCaseIdSchema)
		.use(requireRunCaseMember)
		.handler(async ({ errors, input }): Promise<{ status: string | null }> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			if (defect.defectKey === null) {
				throw errors.BAD_REQUEST({ message: "该用例没有关联 Jira issue" });
			}
			const resolution = await resolveJiraClient(defect.projectId);
			if (resolution.kind !== "ok") {
				throw errors.BAD_REQUEST({ message: "本项目当前无法访问 Jira" });
			}
			const issue = await resolution.client.getIssue(defect.defectKey);
			if (!issue.ok) {
				throw errors.BAD_GATEWAY({
					message: describeJiraFailure(issue.failure),
				});
			}
			const { status } = issue.value;
			if (status !== null) {
				await updateDefectStatusByIssueKey(
					defect.projectId,
					issue.value.key,
					status
				);
			}
			return { status };
		}),
};
