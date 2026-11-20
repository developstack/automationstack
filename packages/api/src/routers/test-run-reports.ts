import { SYSTEM_SUBMITTER } from "@automationstack/db/repositories/test-run-report-list-core";
import { listSubmittedReports } from "@automationstack/db/repositories/test-run-report-list-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";

const KEYWORD_MAX_LENGTH = 200;

const submittedReportsSchema = z.object({
	keyword: z.string().max(KEYWORD_MAX_LENGTH).optional(),
	page: z.number().int().min(1).optional(),
	projectId: z.uuid(),
	submittedBefore: z.date().optional(),
	submittedFrom: z.date().optional(),
	submitter: z.union([z.uuid(), z.literal(SYSTEM_SUBMITTER)]).optional(),
});

export const testRunReportProcedures = {
	/** 项目中已提交的测试报告，分页。 */
	submittedReports: protectedProcedure
		.input(submittedReportsSchema)
		.use(requireProjectMember)
		.handler(({ input: { projectId, ...filter } }) =>
			listSubmittedReports(projectId, filter)
		),
};
