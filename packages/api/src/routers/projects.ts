import {
	createProject,
	getProjectById,
	listProjects,
	removeProject,
	updateProject,
} from "@automationstack/db/repositories/projects-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { publishInvalidate } from "../lib/realtime-publish";

const projectIdSchema = z.object({ id: z.uuid() });

const createProjectSchema = z.object({
	description: z.string().nullable().optional(),
	name: z.string().min(1),
});

const updateProjectSchema = z.object({
	description: z.string().nullable().optional(),
	id: z.uuid(),
	name: z.string().min(1).optional(),
});

export const projectsRouter = {
	create: protectedProcedure
		.input(createProjectSchema)
		.handler(async ({ context, input }) => {
			const project = await createProject({
				description: input.description,
				name: input.name,
			});
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
		.errors({ NOT_FOUND: {} })
		.input(projectIdSchema)
		.handler(async ({ errors, input }) => {
			const project = await getProjectById(input.id);
			if (!project) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			return project;
		}),
	list: protectedProcedure.handler(() => listProjects()),
	remove: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(projectIdSchema)
		.handler(async ({ context, errors, input }) => {
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
		.errors({ NOT_FOUND: {} })
		.input(updateProjectSchema)
		.handler(async ({ context, errors, input }) => {
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
