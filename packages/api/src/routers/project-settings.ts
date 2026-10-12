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
	autoSubmitAfterCompletedDays: z
		.number()
		.int()
		.min(MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS)
		.max(MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS),
	projectId: z.uuid(),
});

export const projectSettingsRouter = {
	get: protectedProcedure
		.input(projectIdSchema)
		.use(requireProjectMember)
		.handler(({ input }) => getProjectSettings(input.projectId)),
	update: protectedProcedure
		.errors(routerErrors)
		.input(updateProjectSettingsSchema)
		.use(requireProjectMember)
		.handler(({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({
					message: "只有平台管理员和身为项目 owner 的项目管理员能改项目设置",
				});
			}
			return upsertProjectSettings(input.projectId, {
				autoSubmitAfterCompletedDays: input.autoSubmitAfterCompletedDays,
			});
		}),
};
