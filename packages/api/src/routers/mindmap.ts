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

/**
 * 批量失败原因里可能出现的枚举码。
 *
 * 逐条来自 repository 的失败分支：createModule / moveModule 的
 * `invalid-parent` 与 `cycle`、各种 `not-found`、createCase 的 `duplicate-id`
 * 与 `invalid-module`、renameCase 的 `conflict`、删用例的 `blocked`，
 * 外加 `runMindmapBatch` 自己的 `batch-limit-exceeded`。
 * 写成联合类型是为了让下面那张表少一条就编译不过——漏翻的表现不是报错，
 * 而是用户在画布上看到一个英文枚举。
 */
type MindmapBatchReasonCode =
	| "batch-limit-exceeded"
	| "blocked"
	| "conflict"
	| "cycle"
	| "duplicate-id"
	| "invalid-module"
	| "invalid-parent"
	| "not-found";

/**
 * 枚举码 → 人话。措辞与单条路径上的同类拒绝对齐（删用例那条见
 * `routers/cases.ts`），两边说法漂移会让同一件事在列表里和脑图里读起来
 * 像两个不同的问题。
 *
 * 批量路径丢掉了结构化数据（repository 只上抛一个码），所以这里说不出
 * 「被几个测试任务引用」这种数字，只能说清是什么性质的拒绝。
 */
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

/** 枚举码的形状：全小写字母加连字符。已经翻好的中文句子不会命中。 */
const REASON_CODE_PATTERN = /^[a-z][a-z-]*$/;

const UNKNOWN_REASON_MESSAGE = "该操作被服务端拒绝";

/**
 * 把批量失败原因换成用户读得懂的一句话。
 *
 * 有一类 reason **本来就是人话**：删模块被引用挡住时，repository 上抛的是
 * `describeModuleDeleteBlock` 拼好的整句（要点名是哪个模块、被哪些用例挡住，
 * 那些结构化数据到不了这一层，只能在那边拼）。这种原样透出，别再翻一次。
 *
 * 剩下认不出来的：长得像枚举码就说明是新增了失败分支却忘了补这张表，
 * 给通用文案而不是把码甩给用户——码对用户没有任何意义。
 */
export function describeMindmapBatchReason(reason: string): string {
	const message = REASON_MESSAGES[reason];
	if (message !== undefined) {
		return message;
	}
	return REASON_CODE_PATTERN.test(reason) ? UNKNOWN_REASON_MESSAGE : reason;
}

export const mindmapRouter = {
	/**
	 * 批量应用画布上的改动。授权走 `requireMindmapBatchMember`：整批必须落在
	 * **同一个**项目里，理由与算法见 `../lib/mindmap-batch-scope.ts`——
	 * 这里不能像别处那样「取第一个 id 解析出项目」，那正好是这条接口独有的洞。
	 */
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
				// 这句是用户唯一能看到的解释：整批被回滚了，前端只能重取服务端数据，
				// 没有第二层界面去展开原因。所以码必须在这里翻成人话。
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
				// 不能默默返回空树：那会让前端把「模块不属于本项目」误读成「模块是空的」。
				throw errors.NOT_FOUND({ message: "模块不存在或不属于该项目" });
			}
			return result.payload;
		}),
};
