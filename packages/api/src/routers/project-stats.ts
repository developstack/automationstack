import { getActivityFeed } from "@automationstack/db/repositories/project-stats-activity";
import { getProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import {
	getExecutionCoverage,
	getLatestResults,
} from "@automationstack/db/repositories/project-stats-execution";
import { getProjectOverviewStats } from "@automationstack/db/repositories/project-stats-repository";
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

/** 游标是上一页最后一条日志的 cursor，由服务端生成。 */
const MAX_FEED_CURSOR_LENGTH = 200;

const activityFeedProcedure = protectedProcedure
	.input(
		projectStatsInputSchema.extend({
			cursor: z.string().max(MAX_FEED_CURSOR_LENGTH).optional(),
		})
	)
	.use(requireProjectMember);

export const projectStatsRouter = {
	activeRuns: projectStatsProcedure.handler(({ input }) =>
		getActiveRuns(input.projectId)
	),
	activityFeed: activityFeedProcedure.handler(({ input }) =>
		getActivityFeed(input.projectId, input.cursor)
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
	runTrend: projectStatsProcedure.handler(({ input }) =>
		getRunTrend(input.projectId)
	),
};
