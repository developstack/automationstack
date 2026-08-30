import {
	getProjectSettings,
	upsertProjectSettings,
} from "@automationstack/db/repositories/project-settings-repository";
import {
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "@automationstack/db/schema/project-settings-core";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { canAdministerProject } from "../lib/project-access";

const projectIdSchema = z.object({ projectId: z.uuid() });

const routerErrors = {
	FORBIDDEN: {},
} as const;

const updateProjectSettingsSchema = z.object({
	/**
	 * 区间直接复用 `schema/project-settings-core` 导出的常量，不写字面量：CHECK 约束
	 * `project_settings_auto_submit_days_range` 用的是同一对常量，
	 * 各写一份就有了两处真相，改一处忘另一处时 zod 会先于 CHECK 报错，
	 * 看起来像 bug，其实是漂移。
	 *
	 * 从 `-core` 那个文件取而不是从 `schema/project-settings`：后者顶上是
	 * `drizzle-orm/pg-core`，本包不许在运行时 import drizzle（package.json 里
	 * 也没有这个依赖）。`-core` 是零依赖的常量模块，前端同样从它取。
	 */
	autoSubmitAfterCompletedDays: z
		.number()
		.int()
		.min(MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS)
		.max(MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS),
	projectId: z.uuid(),
});

export const projectSettingsRouter = {
	/**
	 * 项目设置。没有设置行的项目也返回完整对象（`configured: false` +
	 * 兜底默认值），设置页据此区分「有人显式选了 3 天」和「从没人管过」。
	 */
	get: protectedProcedure
		.input(projectIdSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectSettings(input.projectId)),
	/**
	 * 保存设置（限项目 owner / 平台 admin）。
	 *
	 * **不发实时失效事件**：`invalidateEntitySchema` 里没有 `projectSettings` 这个实体，而失效事件是按 id 列表投递的
	 * （`publishInvalidate` 在 `ids` 为空时直接 no-op），设置行没有前端认得的 id。
	 * 代价是别人开着的设置页不会自动刷新——改天数是低频操作，
	 * 不值得为它扩协议 + 改前端映射（那两处分别归实时和 W5/W6）。
	 */
	update: protectedProcedure
		.errors(routerErrors)
		.input(updateProjectSettingsSchema)
		.use(requireProjectMember)
		.handler(({ context, errors, input }) => {
			// 比「进得来就能写」更严：这一行改的不是某条用例，而是全项目所有
			// 测试任务的自动提交时机——后果落在别人头上，与改项目名 / 管成员
			// 同档（判定见 `lib/project-access.ts` 的 canAdministerProject）。
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: "只有项目 owner 能改项目设置" });
			}
			return upsertProjectSettings(input.projectId, {
				autoSubmitAfterCompletedDays: input.autoSubmitAfterCompletedDays,
			});
		}),
};
