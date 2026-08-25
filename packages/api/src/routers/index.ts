import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { aiRouter } from "./ai";
import { aiProviderConfigRouter } from "./ai-provider-config";
import { apiTokensRouter } from "./api-tokens";
import { authRouter } from "./auth";
import { caseAttachmentsRouter } from "./case-attachments";
import { casesRouter } from "./cases";
import { jiraRouter } from "./jira";
import { mindmapRouter } from "./mindmap";
import { modulesRouter } from "./modules";
import { projectSettingsRouter } from "./project-settings";
import { projectStatsRouter } from "./project-stats";
import { projectsRouter } from "./projects";
import { testRunAttachmentsRouter } from "./test-run-attachments";
import { testRunsRouter } from "./test-runs";
import { usersRouter } from "./users";

export const appRouter = {
	ai: aiRouter,
	aiProviderConfig: aiProviderConfigRouter,
	apiTokens: apiTokensRouter,
	auth: authRouter,
	caseAttachments: caseAttachmentsRouter,
	cases: casesRouter,
	healthCheck: publicProcedure.handler(() => "OK"),
	jira: jiraRouter,
	mindmap: mindmapRouter,
	modules: modulesRouter,
	projectSettings: projectSettingsRouter,
	projectStats: projectStatsRouter,
	projects: projectsRouter,
	testRunAttachments: testRunAttachmentsRouter,
	testRuns: testRunsRouter,
	users: usersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
