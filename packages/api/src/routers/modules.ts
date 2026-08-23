import { ensureModulePath } from "@automationstack/db/repositories/module-path-repository";
import {
	createModule,
	listModulesByProject,
	type ModuleMutationResult,
	moveModule,
	removeModule,
	renameModule,
	reorderModules,
} from "@automationstack/db/repositories/modules-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { buildModuleTree } from "../lib/module-tree";
import { publishInvalidate } from "../lib/realtime-publish";

const createModuleSchema = z.object({
	index: z.number().int().min(0).optional(),
	name: z.string().min(1),
	parentId: z.uuid().nullable(),
	projectId: z.uuid(),
});

const renameModuleSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
});

const moveModuleSchema = z.object({
	id: z.uuid(),
	index: z.number().int().min(0).optional(),
	parentId: z.uuid().nullable(),
});

const reorderModulesSchema = z.object({
	orderedIds: z.array(z.uuid()).min(1),
	parentId: z.uuid().nullable(),
	projectId: z.uuid(),
});

const MAX_MODULE_PATH_DEPTH = 10;

export const ensurePathSchema = z.object({
	path: z
		.array(z.string().min(1))
		.min(1)
		.max(MAX_MODULE_PATH_DEPTH)
		.describe(
			'Module names from root to leaf, e.g. ["Orders", "Payment", "Refund"].'
		),
	projectId: z.uuid().describe("Project id the path belongs to."),
});

const moduleErrors = {
	BAD_REQUEST: {},
	NOT_FOUND: {},
} as const;

interface ModuleErrorThrowers {
	BAD_REQUEST: (options?: { message?: string }) => Error;
	NOT_FOUND: (options?: { message?: string }) => Error;
}

function unwrapModuleResult(
	result: ModuleMutationResult,
	errors: ModuleErrorThrowers
) {
	if (result.kind === "ok") {
		return result.module;
	}
	if (result.kind === "cycle") {
		throw errors.BAD_REQUEST({ message: "非法移动：目标位置在自身子树内" });
	}
	if (result.kind === "invalid-parent") {
		throw errors.BAD_REQUEST({
			message: "父模块不存在或不属于同一项目",
		});
	}
	throw errors.NOT_FOUND({ message: "模块不存在" });
}

export const modulesRouter = {
	create: protectedProcedure
		.errors(moduleErrors)
		.input(createModuleSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await createModule(input);
			const created = unwrapModuleResult(result, errors);
			publishInvalidate({
				action: "create",
				context,
				entity: "module",
				ids: [created.id],
				projectId: created.projectId,
			});
			return created;
		}),
	ensurePath: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(ensurePathSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await ensureModulePath(input);
			if (result.kind === "project-not-found") {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			if (result.kind === "empty-path") {
				throw errors.BAD_REQUEST({ message: "path 不能为空" });
			}
			publishInvalidate({
				action: "create",
				context,
				entity: "module",
				ids: result.createdModuleIds,
				projectId: input.projectId,
			});
			return {
				createdModuleIds: result.createdModuleIds,
				moduleId: result.moduleId,
			};
		}),
	move: protectedProcedure
		.errors(moduleErrors)
		.input(moveModuleSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await moveModule(input);
			const moved = unwrapModuleResult(result, errors);
			publishInvalidate({
				action: "move",
				context,
				entity: "module",
				ids: [moved.id],
				projectId: moved.projectId,
			});
			return moved;
		}),
	remove: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, errors, input }) => {
			const removed = await removeModule(input.id);
			if (!removed) {
				throw errors.NOT_FOUND({ message: "模块不存在" });
			}
			publishInvalidate({
				action: "delete",
				context,
				entity: "module",
				ids: [removed.id],
				projectId: removed.projectId,
			});
			return { id: input.id };
		}),
	rename: protectedProcedure
		.errors(moduleErrors)
		.input(renameModuleSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await renameModule(input.id, input.name);
			const renamed = unwrapModuleResult(result, errors);
			publishInvalidate({
				action: "update",
				context,
				entity: "module",
				ids: [renamed.id],
				projectId: renamed.projectId,
			});
			return renamed;
		}),
	reorder: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(reorderModulesSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await reorderModules(input);
			if (result.kind === "invalid-set") {
				throw errors.BAD_REQUEST({
					message: "orderedIds 与该层级现有模块不一致",
				});
			}
			publishInvalidate({
				action: "move",
				context,
				entity: "module",
				ids: input.orderedIds,
				projectId: input.projectId,
			});
			return { ok: true };
		}),
	tree: protectedProcedure
		.input(z.object({ projectId: z.uuid() }))
		.handler(async ({ input }) => {
			const rows = await listModulesByProject(input.projectId);
			return buildModuleTree(rows);
		}),
};
