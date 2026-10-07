import {
	listMindmapCaseNodes,
	MINDMAP_BATCH_LIMIT,
	runMindmapBatch,
} from "@automationstack/db/repositories/mindmap-repository";
import { listModulesByProject } from "@automationstack/db/repositories/modules-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure, requireProjectMember } from "../index";
import { publishMindmapInvalidations } from "../lib/mindmap-invalidate";
import { scopeMindmapTree } from "../lib/mindmap-scope";
import { requireMindmapBatchMember } from "../lib/project-scope";

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

const treeSchema = z.object({
	includeSteps: z.boolean().optional(),
	moduleId: z.uuid().optional(),
	projectId: z.uuid(),
});

const batchSchema = z.object({
	operations: z.array(mindmapOperationSchema).min(1).max(MINDMAP_BATCH_LIMIT),
});

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

type MindmapBatchReasonCode =
	| "batch-limit-exceeded"
	| "blocked"
	| "conflict"
	| "cycle"
	| "duplicate-id"
	| "invalid-module"
	| "invalid-parent"
	| "not-found";

const REASON_MESSAGES: Record<string, string> = {
	"batch-limit-exceeded": `一次最多提交 ${MINDMAP_BATCH_LIMIT} 个操作，请分批保存`,
	blocked: "该用例被测试任务引用，无法删除；可改为「废弃」状态",
	conflict: "该用例已被他人修改，请刷新后重试",
	cycle: "不能把模块移动到它自己的子模块下",
	"duplicate-id": "该节点已经存在，无需重复创建",
	"invalid-module": "目标模块不存在或不属于该项目",
	"invalid-parent": "目标父模块不存在或不属于该项目",
	"not-found": "目标节点已不存在，可能已被他人删除",
} satisfies Record<MindmapBatchReasonCode, string>;

const REASON_CODE_PATTERN = /^[a-z][a-z-]*$/;

const UNKNOWN_REASON_MESSAGE = "该操作被服务端拒绝";

export function describeMindmapBatchReason(reason: string): string {
	const message = REASON_MESSAGES[reason];
	if (message !== undefined) {
		return message;
	}
	return REASON_CODE_PATTERN.test(reason) ? UNKNOWN_REASON_MESSAGE : reason;
}

export const mindmapRouter = {
	batch: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(batchSchema)
		.use(requireMindmapBatchMember)
		.handler(async ({ context, errors, input }) => {
			const result = await runMindmapBatch(
				input.operations,
				actorName(context)
			);
			if (result.kind === "failed") {
				throw errors.BAD_REQUEST({
					message: `批量操作第 ${result.index + 1} 项失败：${describeMindmapBatchReason(result.reason)}`,
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
		.use(requireProjectMember)
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
				throw errors.NOT_FOUND({ message: "模块不存在或不属于该项目" });
			}
			return result.payload;
		}),
};
