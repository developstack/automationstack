import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { apiTokensRouter } from "./api-tokens";
import { authRouter } from "./auth";
import { caseAttachmentsRouter } from "./case-attachments";
import { casesRouter } from "./cases";
import { jiraRouter } from "./jira";
import { mindmapRouter } from "./mindmap";
import { modulesRouter } from "./modules";
import { projectMembersRouter } from "./project-members";
import { projectSettingsRouter } from "./project-settings";
import { projectStatsRouter } from "./project-stats";
import { projectsRouter } from "./projects";
import { testRunAttachmentsRouter } from "./test-run-attachments";
import { testRunsRouter } from "./test-runs";
import { usersRouter } from "./users";

export const appRouter = {
	apiTokens: apiTokensRouter,
	auth: authRouter,
	caseAttachments: caseAttachmentsRouter,
	cases: casesRouter,
	healthCheck: publicProcedure.handler(() => "OK"),
	jira: jiraRouter,
	mindmap: mindmapRouter,
	modules: modulesRouter,
	projectMembers: projectMembersRouter,
	projectSettings: projectSettingsRouter,
	projectStats: projectStatsRouter,
	projects: projectsRouter,
	testRunAttachments: testRunAttachmentsRouter,
	testRuns: testRunsRouter,
	users: usersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
