import { getRecentChanges } from "@automationstack/db/repositories/project-stats-activity";
import { getProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import {
	getExecutionCoverage,
	getLatestResults,
} from "@automationstack/db/repositories/project-stats-execution";
import {
	getProjectOverviewStats,
	getStaleHighPriorityStats,
} from "@automationstack/db/repositories/project-stats-repository";
import { getActiveRuns } from "@automationstack/db/repositories/project-stats-runs";
import {
	getCaseTrend,
	getExecutionTrend,
	getRunTrend,
} from "@automationstack/db/repositories/project-stats-trend";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";

const projectStatsInputSchema = z.object({ projectId: z.uuid() });

/** 项目统计都是只读查询，输入只有 projectId，只有项目成员可以查询。 */
const projectStatsProcedure = protectedProcedure
	.input(projectStatsInputSchema)
	.use(requireProjectMember);

export const projectStatsRouter = {
	activeRuns: projectStatsProcedure.handler(({ input }) =>
		getActiveRuns(input.projectId)
	),
	caseTrend: projectStatsProcedure.handler(({ input }) =>
		getCaseTrend(input.projectId)
	),
	coverage: projectStatsProcedure.handler(({ input }) =>
		getProjectCoverageStats(input.projectId)
	),
	executionCoverage: projectStatsProcedure.handler(({ input }) =>
		getExecutionCoverage(input.projectId)
	),
	executionTrend: projectStatsProcedure.handler(({ input }) =>
		getExecutionTrend(input.projectId)
	),
	latestResults: projectStatsProcedure.handler(({ input }) =>
		getLatestResults(input.projectId)
	),
	overview: projectStatsProcedure.handler(({ input }) =>
		getProjectOverviewStats(input.projectId)
	),
	recentChanges: projectStatsProcedure.handler(({ input }) =>
		getRecentChanges(input.projectId)
	),
	runTrend: projectStatsProcedure.handler(({ input }) =>
		getRunTrend(input.projectId)
	),
	staleHighPriority: projectStatsProcedure.handler(({ input }) =>
		getStaleHighPriorityStats(input.projectId)
	),
};
