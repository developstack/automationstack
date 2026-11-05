import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { apiTokensRouter } from "./api-tokens";
import { authRouter } from "./auth";
import { authSettingsRouter } from "./auth-settings";
import { caseAttachmentsRouter } from "./case-attachments";
import { casesRouter } from "./cases";
import { mindmapRouter } from "./mindmap";
import { modulesRouter } from "./modules";
import { projectMembersRouter } from "./project-members";
import { projectSettingsRouter } from "./project-settings";
import { projectStatsRouter } from "./project-stats";
import { projectsRouter } from "./projects";
import { storageSettingsRouter } from "./storage-settings";
import { testRunAttachmentsRouter } from "./test-run-attachments";
import { testRunsRouter } from "./test-runs";
import { usersRouter } from "./users";

export const appRouter = {
	apiTokens: apiTokensRouter,
	auth: authRouter,
	authSettings: authSettingsRouter,
	caseAttachments: caseAttachmentsRouter,
	cases: casesRouter,
	healthCheck: publicProcedure.handler(() => "OK"),
	mindmap: mindmapRouter,
	modules: modulesRouter,
	projectMembers: projectMembersRouter,
	projectSettings: projectSettingsRouter,
	projectStats: projectStatsRouter,
	projects: projectsRouter,
	storageSettings: storageSettingsRouter,
	testRunAttachments: testRunAttachmentsRouter,
	testRuns: testRunsRouter,
	users: usersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
