import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { aiRouter } from "./ai";
import { aiProviderConfigRouter } from "./ai-provider-config";
import { authRouter } from "./auth";
import { casesRouter } from "./cases";
import { mindmapRouter } from "./mindmap";
import { modulesRouter } from "./modules";
import { projectStatsRouter } from "./project-stats";
import { projectsRouter } from "./projects";
import { usersRouter } from "./users";

export const appRouter = {
	ai: aiRouter,
	aiProviderConfig: aiProviderConfigRouter,
	auth: authRouter,
	cases: casesRouter,
	healthCheck: publicProcedure.handler(() => "OK"),
	mindmap: mindmapRouter,
	modules: modulesRouter,
	projectStats: projectStatsRouter,
	projects: projectsRouter,
	users: usersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
