import {
	createProjectWithOwner,
	listProjectsByMember,
} from "@automationstack/db/repositories/project-members-repository";
import {
	getProjectById,
	listProjects,
	removeProject,
	updateProject,
} from "@automationstack/db/repositories/projects-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { canAdministerProject, seesAllProjects } from "../lib/project-access";
import { publishInvalidate } from "../lib/realtime-publish";

const projectIdSchema = z.object({ id: z.uuid() });

/** `requireProjectMember` 只认 `projectId`，这里把 `id` 改名喂给它。 */
const toProjectScope = (input: { id: string }) => ({ projectId: input.id });

const createProjectSchema = z.object({
	description: z.string().nullable().optional(),
	name: z.string().min(1),
});

const updateProjectSchema = z.object({
	description: z.string().nullable().optional(),
	id: z.uuid(),
	name: z.string().min(1).optional(),
});

const routerErrors = {
	FORBIDDEN: {},
	NOT_FOUND: {},
} as const;

/** 改名与删项目都要 owner，理由见 `lib/project-access.ts` 的 canAdministerProject。 */
const OWNER_REQUIRED_MESSAGE = "只有项目 owner 能执行该操作";

export const projectsRouter = {
	create: protectedProcedure
		.input(createProjectSchema)
		.handler(async ({ context, input }) => {
			// 建项目与写 owner 成员记录在同一个事务里：少了 owner 那一行，
			// 项目建出来连创建者自己都进不去（`requireProjectMember` 会拦下）。
			const project = await createProjectWithOwner(
				{ description: input.description, name: input.name },
				context.user.id
			);
			publishInvalidate({
				action: "create",
				context,
				entity: "project",
				ids: [project.id],
				projectId: project.id,
			});
			return project;
		}),
	get: protectedProcedure
		.errors(routerErrors)
		.input(projectIdSchema)
		.use(requireProjectMember, toProjectScope)
		.handler(async ({ errors, input }) => {
			const project = await getProjectById(input.id);
			if (!project) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			return project;
		}),
	/**
	 * 只列出自己所属的项目；平台 admin 看全部。
	 *
	 * 这一条**不挂 `requireProjectMember`**——那道中间件要一个 projectId，
	 * 而这里正是「还不知道有哪些项目」的地方，过滤只能落在查询里。
	 */
	list: protectedProcedure.handler(({ context }) =>
		seesAllProjects(context.user.role)
			? listProjects()
			: listProjectsByMember(context.user.id)
	),
	remove: protectedProcedure
		.errors(routerErrors)
		.input(projectIdSchema)
		.use(requireProjectMember, toProjectScope)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			const removed = await removeProject(input.id);
			if (!removed) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			publishInvalidate({
				action: "delete",
				context,
				entity: "project",
				ids: [input.id],
				projectId: input.id,
			});
			return { id: input.id };
		}),
	update: protectedProcedure
		.errors(routerErrors)
		.input(updateProjectSchema)
		.use(requireProjectMember, toProjectScope)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			const project = await updateProject(input.id, {
				description: input.description,
				name: input.name,
			});
			if (!project) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "project",
				ids: [project.id],
				projectId: project.id,
			});
			return project;
		}),
};
