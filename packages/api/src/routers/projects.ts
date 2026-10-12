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
import {
	canAdministerProject,
	canCreateProject,
	seesAllProjects,
} from "../lib/project-access";
import { publishInvalidate } from "../lib/realtime-publish";

const projectIdSchema = z.object({ id: z.uuid() });

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

const OWNER_REQUIRED_MESSAGE =
	"只有平台管理员和身为项目 owner 的项目管理员能执行该操作";

const CREATE_FORBIDDEN_MESSAGE = "只有平台管理员和项目管理员可以新建项目";

export const projectsRouter = {
	create: protectedProcedure
		.errors(routerErrors)
		.input(createProjectSchema)
		.handler(async ({ context, errors, input }) => {
			if (!canCreateProject(context.user.role)) {
				throw errors.FORBIDDEN({ message: CREATE_FORBIDDEN_MESSAGE });
			}
			// 新建者自动成为项目 owner。
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
