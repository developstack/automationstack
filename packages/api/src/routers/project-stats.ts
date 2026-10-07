import { getRecentChanges } from "@automationstack/db/repositories/project-stats-activity";
import { getProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import {
	getProjectOverviewStats,
	getStaleHighPriorityStats,
} from "@automationstack/db/repositories/project-stats-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";

const projectStatsInputSchema = z.object({ projectId: z.uuid() });

export const projectStatsRouter = {
	coverage: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectCoverageStats(input.projectId)),
	overview: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectOverviewStats(input.projectId)),
	recentChanges: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getRecentChanges(input.projectId)),
	staleHighPriority: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getStaleHighPriorityStats(input.projectId)),
};
