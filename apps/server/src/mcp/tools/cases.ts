import {
	importBatchSchema,
	searchCasesSchema,
} from "@automationstack/api/routers/case-import";
// 分页上限直接取 `cases.list` 自己的常量：这里写字面量 100 的话，
// 哪天列表那边放宽了，工具入参会先一步把用户的请求挡在门外，
// 而且报的是「MCP 工具校验失败」，看不出是两处上限对不上。
import { MAX_PAGE_SIZE } from "@automationstack/db/repositories/case-list-repository";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	type CaseDetail,
	resolveReadPageSize,
	shapeReadCases,
} from "./case-read-shape";
import {
	IMPORT_TEST_CASES_DESCRIPTION,
	LIST_CASE_TAGS_DESCRIPTION,
	READ_CASES_DESCRIPTION,
	SEARCH_CASES_DESCRIPTION,
} from "./case-tool-descriptions";
import {
	type ApiClient,
	jsonResult,
	safeToolCall,
	type ToolResult,
} from "./tool-helpers";

/**
 * 读取面的入参刻意比 `cases.list` 窄一点：不暴露 `includeDescendants` 之外的
 * 分页细节以外的东西，也不暴露列表页专用的排序参数——工具描述里说得清的参数
 * 才值得存在，多一个参数就多一次「该不该填」的判断。
 */
const readCasesInput = {
	detail: z
		.enum(["summary", "full"])
		.optional()
		.describe(
			"summary (default) = no case bodies; full = with preconditions and steps."
		),
	includeDescendants: z
		.boolean()
		.optional()
		.describe("Include cases of the module's descendants (default false)."),
	keyword: z.string().optional().describe("Case-name substring filter."),
	moduleId: z.uuid().optional().describe("Restrict to one module."),
	page: z.number().int().min(1).optional().describe("1-based page number."),
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(MAX_PAGE_SIZE)
		.optional()
		.describe("Rows per page; capped at 20 when detail is 'full'."),
	priority: z
		.array(z.enum(["P0", "P1", "P2", "P3"]))
		.optional()
		.describe("Keep only these priorities."),
	projectId: z.uuid().describe("Project id."),
	sourceRefPrefix: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Prefix match on sourceRef, e.g. 'gen:PROJ-1234#' for one requirement."
		),
	status: z
		.enum(["draft", "active", "deprecated"])
		.optional()
		.describe("Keep only cases in this status."),
	tags: z
		.array(z.string())
		.optional()
		.describe("Keep cases carrying any of these tags."),
};

/** 入参的类型面。`detail` 只影响返回整形，**不往 `cases.list` 传**。 */
interface ReadCasesInput {
	detail?: CaseDetail;
	includeDescendants?: boolean;
	keyword?: string;
	moduleId?: string;
	page?: number;
	pageSize?: number;
	priority?: ("P0" | "P1" | "P2" | "P3")[];
	projectId: string;
	sourceRefPrefix?: string;
	status?: "active" | "deprecated" | "draft";
	tags?: string[];
}

async function readCases(
	client: ApiClient,
	{ detail: rawDetail, pageSize, ...filter }: ReadCasesInput
): Promise<ToolResult> {
	const detail = rawDetail ?? "summary";
	const result = await client.cases.list({
		...filter,
		pageSize: resolveReadPageSize(detail, pageSize),
	});
	return jsonResult(shapeReadCases(result, detail));
}

export function registerCaseTools(server: McpServer, client: ApiClient): void {
	server.registerTool(
		"read_cases",
		{ description: READ_CASES_DESCRIPTION, inputSchema: readCasesInput },
		(input) => safeToolCall(() => readCases(client, input))
	);
	server.registerTool(
		"list_case_tags",
		{
			description: LIST_CASE_TAGS_DESCRIPTION,
			inputSchema: { projectId: z.uuid().describe("Project id.") },
		},
		({ projectId }) =>
			safeToolCall(async () =>
				jsonResult(await client.cases.listTags({ projectId }))
			)
	);
	server.registerTool(
		"import_test_cases",
		{
			description: IMPORT_TEST_CASES_DESCRIPTION,
			inputSchema: importBatchSchema,
		},
		(input) =>
			safeToolCall(async () =>
				jsonResult(await client.cases.importBatch(input))
			)
	);
	server.registerTool(
		"search_cases",
		{ description: SEARCH_CASES_DESCRIPTION, inputSchema: searchCasesSchema },
		(input) =>
			safeToolCall(async () => jsonResult(await client.cases.search(input)))
	);
}
