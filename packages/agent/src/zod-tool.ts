/**
 * zod schema → pi 工具定义的适配层。
 *
 * 单独成文件而不是塞进 `tools.ts`：三个工具各自「问了谁、写了什么」是领域
 * 决策，「zod 怎么变成 pi 认的 JSON Schema、领域返回值怎么裹成
 * `AgentToolResult`」是一次性的机械转换。混在一起的话，下次换运行时就得在
 * 三个工具里各抄一遍同样的胶水。
 *
 * 为什么 `z.toJSONSchema()` 的**普通** JSON Schema 能直接喂给 pi：
 * 1. `AgentTool.parameters` 的类型约束是 typebox 的 `TSchema`，而 typebox
 *    1.3.7 里 `TSchema` 是空接口（`export interface TSchema {}`），任意对象
 *    结构上都满足它，因此不需要任何断言；
 * 2. pi 的 `validateToolArguments` 显式判过 `Symbol.for("TypeBox.Kind")`，
 *    没有那个符号就退回普通 JSON Schema 校验。
 *
 * `TSchema` 由 `@earendil-works/pi-ai` 再导出，本包因此**不必**把 typebox
 * 列成直接依赖。
 */
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import { z } from "zod";

/**
 * 领域侧的工具定义：入参是 zod schema，`execute` 直接返回领域值。
 *
 * 刻意不暴露 pi 的 `toolCallId` / `signal` / `onUpdate`：三个工具都用不上，
 * 摊到定义里只会让每个工具多三个永远不读的形参。
 */
export interface ZodToolDefinition<TInput extends z.ZodType, TOutput> {
	description: string;
	execute: (input: z.output<TInput>) => Promise<TOutput> | TOutput;
	inputSchema: TInput;
	/** 供 UI 展示的名字；pi 的 `AgentTool` 要求必填。 */
	label: string;
	name: string;
}

/** 回灌给模型的文本：字符串原样，其余序列化成 JSON。 */
function toContentText(output: unknown): string {
	return typeof output === "string" ? output : JSON.stringify(output);
}

/**
 * 把一条 zod 工具定义转成 pi 的 `AgentTool`。
 *
 * 领域值同时进 `content`（给模型看）和 `details`（给宿主与测试看）：pi 不像
 * AI SDK 那样把工具返回值直接当结果，`content` 是唯一会进 transcript 的部分。
 */
export function zodTool<TInput extends z.ZodType, TOutput>(
	definition: ZodToolDefinition<TInput, TOutput>
): AgentTool<TSchema, TOutput> {
	// `$schema` 会被 pi 原样塞进 provider 请求的 tools[].function.parameters，
	// 对 OpenAI 兼容端点没有意义，用带 rest 的解构摘掉（不用 delete）。
	const { $schema: _schemaUrl, ...parameters } = z.toJSONSchema(
		definition.inputSchema,
		{ io: "input" }
	);

	return {
		description: definition.description,
		execute: async (_toolCallId, params): Promise<AgentToolResult<TOutput>> => {
			// pi 已按同一份 JSON Schema 验过一遍；这里再 parse 是为了补回
			// JSON Schema 表达不了的 zod refinement / transform，顺带拿到精确类型。
			const output = await definition.execute(
				definition.inputSchema.parse(params)
			);
			return {
				content: [{ text: toContentText(output), type: "text" }],
				details: output,
			};
		},
		label: definition.label,
		name: definition.name,
		parameters,
	};
}
