import { listTestRunCaseEvents } from "@automationstack/db/repositories/test-run-case-events-repository";
import { listTestRunEvents } from "@automationstack/db/repositories/test-run-status-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRunCaseMember, requireRunMember } from "../lib/project-scope";
import { runIdSchema } from "../schemas/test-run";

const runCaseIdSchema = z.object({ runCaseId: z.uuid() });

export const testRunEventProcedures = {
	listCaseEvents: protectedProcedure
		.input(runCaseIdSchema)
		.use(requireRunCaseMember)
		.handler(({ input }) => listTestRunCaseEvents(input.runCaseId)),
	listEvents: protectedProcedure
		.input(runIdSchema)
		.use(requireRunMember)
		.handler(({ input }) => listTestRunEvents(input.runId)),
};
