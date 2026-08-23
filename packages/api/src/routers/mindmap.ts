import {
	listMindmapCaseNodes,
	MINDMAP_BATCH_LIMIT,
	runMindmapBatch,
} from "@automationstack/db/repositories/mindmap-repository";
import { listModulesByProject } from "@automationstack/db/repositories/modules-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { publishMindmapInvalidations } from "../lib/mindmap-invalidate";
import { scopeMindmapTree } from "../lib/mindmap-scope";

/** Node references may be real uuids or tempIds minted earlier in a batch. */
const nodeIdSchema = z.string().min(1);

const indexSchema = z.number().int().min(0).optional();

const mindmapOperationSchema = z.discriminatedUnion("op", [
	z.object({
		index: indexSchema,
		name: z.string().min(1),
		op: z.literal("createModule"),
		parentId: nodeIdSchema.nullable(),
		projectId: z.uuid(),
		tempId: z.string().min(1),
	}),
	z.object({
		id: nodeIdSchema,
		name: z.string().min(1),
		op: z.literal("renameModule"),
	}),
	z.object({
		id: nodeIdSchema,
		index: indexSchema,
		op: z.literal("moveModule"),
		parentId: nodeIdSchema.nullable(),
	}),
	z.object({ id: nodeIdSchema, op: z.literal("removeModule") }),
	z.object({
		index: indexSchema,
		moduleId: nodeIdSchema,
		name: z.string().min(1),
		op: z.literal("createCase"),
		projectId: z.uuid(),
		tempId: z.string().min(1),
	}),
	z.object({
		id: nodeIdSchema,
		name: z.string().min(1),
		op: z.literal("renameCase"),
	}),
	z.object({
		id: nodeIdSchema,
		index: indexSchema,
		moduleId: nodeIdSchema,
		op: z.literal("moveCase"),
	}),
	z.object({ id: nodeIdSchema, op: z.literal("removeCase") }),
]);

/**
 * 两个新参数都是可选的，缺省时等价于「整个项目 + 带 steps」，也就是改动前的
 * 行为，前端不改调用点也不会坏。
 *
 * moduleId 只收窄 modules 数组（返回 `[该模块子树]`），不再往上补项目节点：
 * 响应本来就不含项目根，根节点是前端 adapter 用 projectId / projectName 自己
 * 造的（toMindElixirData → encodeProjectNodeId），所以这里保持「模块根数组」
 * 这一形状，adapter 无需改动即可消费，用户也仍然看得到自己在哪个项目下。
 */
const treeSchema = z.object({
	/** 缺省 true：带上 steps，供画布渲染步骤/预期子节点。 */
	includeSteps: z.boolean().optional(),
	/** 缺省 = 全项目。传入时只返回该模块及其子孙（含其下用例）。 */
	moduleId: z.uuid().optional(),
	projectId: z.uuid(),
});

const batchSchema = z.object({
	operations: z.array(mindmapOperationSchema).min(1).max(MINDMAP_BATCH_LIMIT),
});

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const mindmapRouter = {
	batch: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(batchSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await runMindmapBatch(
				input.operations,
				actorName(context)
			);
			if (result.kind === "failed") {
				throw errors.BAD_REQUEST({
					message: `批量操作第 ${result.index + 1} 项失败：${result.reason}`,
				});
			}
			publishMindmapInvalidations({
				context,
				idMap: result.idMap,
				operations: input.operations,
				projectId: result.projectId,
			});
			return { idMap: result.idMap };
		}),
	tree: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(treeSchema)
		.handler(async ({ errors, input }) => {
			const [moduleRows, caseNodes] = await Promise.all([
				listModulesByProject(input.projectId),
				listMindmapCaseNodes(input.projectId),
			]);
			const result = scopeMindmapTree({
				cases: caseNodes,
				includeSteps: input.includeSteps ?? true,
				moduleId: input.moduleId ?? null,
				moduleRows,
			});
			if (result.kind === "module-not-found") {
				// 不能默默返回空树：那会让前端把「模块不属于本项目」误读成「模块是空的」。
				throw errors.NOT_FOUND({ message: "模块不存在或不属于该项目" });
			}
			return result.payload;
		}),
};
