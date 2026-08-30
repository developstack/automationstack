import {
	getAiAdoptionStats,
	getRecentChanges,
} from "@automationstack/db/repositories/project-stats-activity";
import { getProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import {
	getProjectOverviewStats,
	getStaleHighPriorityStats,
} from "@automationstack/db/repositories/project-stats-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";

const projectStatsInputSchema = z.object({ projectId: z.uuid() });

/**
 * 项目概览（dashboard）的只读统计接口。
 *
 * 为什么拆成 5 个过程而不是一个大对象：概览页是六张互相独立的卡片，拆开后
 * 每张卡片各自 loading、各自失效（改一条用例只需重取 overview 与 coverage，
 * 不必把 AI 采纳率和变更时间线也拉一遍），最慢的一条查询也不会拖住整页首屏。
 * 唯一被合并的是「资产总量」与「优先级分布」——它们来自对 test_cases 的同一
 * 次扫描、失效时机也完全一致，拆开只会把同样的扫描做两遍。
 *
 * 所有过程都只按 projectId 聚合，不额外校验项目是否存在：项目不存在时返回
 * 全零 / 空列表，与 cases.list 对不存在项目返回空页的行为一致，概览页因此
 * 不需要为「项目刚被别人删掉」写一条额外的错误分支。
 *
 * ⚠️ 项目级授权（`schema/project-members.ts`）已经落地，但**这个 router 还没
 * 收口**：B2a 只把 `requireProjectMember` 挂在 projects.get/update/remove 与
 * projectMembers.* 上。也就是说非成员拿着一个 projectId 仍能读到这里的聚合
 * 数字。下一批把中间件推到其余项目作用域过程时，这里是必须覆盖的一处。
 *
 * 鉴权用 protectedProcedure，与 cases.list / projects.get 完全同档：统计的
 * 就是用例与模块数据本身，口子不能比数据源更宽。注意 `/mcp` 端点用
 * createRouterClient 造了一个 member 合成用户，appRouter 里的任何过程都会经
 * 它可达——选 protectedProcedure 意味着 MCP 通道可读概览，与它已经能读的
 * cases.list 处于同一档，没有新增暴露面。
 */
export const projectStatsRouter = {
	/** AI 提案的采纳分子 / 分母（不返回百分比，理由见 repository 注释）。 */
	aiAdoption: protectedProcedure
		.input(projectStatsInputSchema)
		.handler(({ input }) => getAiAdoptionStats(input.projectId)),
	/** 模块覆盖缺口：零用例 / 无 active 用例的模块，按子树口径判定。 */
	coverage: protectedProcedure
		.input(projectStatsInputSchema)
		.handler(({ input }) => getProjectCoverageStats(input.projectId)),
	/** 用例总数 + 按 status / priority 的分组计数。 */
	overview: protectedProcedure
		.input(projectStatsInputSchema)
		.handler(({ input }) => getProjectOverviewStats(input.projectId)),
	/** 最近若干条用例版本记录，作为项目变更时间线。 */
	recentChanges: protectedProcedure
		.input(projectStatsInputSchema)
		.handler(({ input }) => getRecentChanges(input.projectId)),
	/** 超过阈值天数未更新的 P0/P1 用例：命中总数 + 前若干条。 */
	staleHighPriority: protectedProcedure
		.input(projectStatsInputSchema)
		.handler(({ input }) => getStaleHighPriorityStats(input.projectId)),
};
