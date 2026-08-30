import { getRecentChanges } from "@automationstack/db/repositories/project-stats-activity";
import { getProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import {
	getProjectOverviewStats,
	getStaleHighPriorityStats,
} from "@automationstack/db/repositories/project-stats-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";

const projectStatsInputSchema = z.object({ projectId: z.uuid() });

/**
 * 项目概览（dashboard）的只读统计接口。
 *
 * 为什么拆成 4 个过程而不是一个大对象：概览页是五张互相独立的卡片，拆开后
 * 每张卡片各自 loading、各自失效（改一条用例只需重取 overview 与 coverage，
 * 不必把变更时间线也拉一遍），最慢的一条查询也不会拖住整页首屏。
 * 唯一被合并的是「资产总量」与「优先级分布」——它们来自对 test_cases 的同一
 * 次扫描、失效时机也完全一致，拆开只会把同样的扫描做两遍。
 *
 * 所有过程都只按 projectId 聚合，不额外校验项目是否存在：项目不存在时返回
 * 全零 / 空列表，与 cases.list 对不存在项目返回空页的行为一致，概览页因此
 * 不需要为「项目刚被别人删掉」写一条额外的错误分支。
 *
 * 四条全部先过 `requireProjectMember`：统计的就是用例与模块数据本身，口子不能
 * 比数据源更宽，而数据源那边（cases.list / modules.tree）现在也都在这道闸门后。
 * 都只是读，所以到 `canEnterProject` 为止，不再要求 owner——概览页正是普通成员
 * 每天进项目第一眼要看的东西。
 */
export const projectStatsRouter = {
	/** 模块覆盖缺口：零用例 / 无 active 用例的模块，按子树口径判定。 */
	coverage: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectCoverageStats(input.projectId)),
	/** 用例总数 + 按 status / priority 的分组计数。 */
	overview: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectOverviewStats(input.projectId)),
	/** 最近若干条用例版本记录，作为项目变更时间线。 */
	recentChanges: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getRecentChanges(input.projectId)),
	/** 超过阈值天数未更新的 P0/P1 用例：命中总数 + 前若干条。 */
	staleHighPriority: protectedProcedure
		.input(projectStatsInputSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getStaleHighPriorityStats(input.projectId)),
};
