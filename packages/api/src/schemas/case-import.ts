import { IMPORT_BATCH_LIMIT } from "@automationstack/db/repositories/case-import-repository";
import { SEARCH_MAX_LIMIT } from "@automationstack/db/repositories/case-search-repository";
import { z } from "zod";

import { importOnDuplicateSchema } from "./case";

// 导入和查找用例的入参。cases.importBatch 和 MCP 的 import_test_cases、search_cases 共用。
// 放在路由之外，所以 MCP 工具使用这些 schema 时不加载服务端的环境变量和对象存储。

const CASES_DESCRIPTION =
	"Cases to import (1-50 per call). Each row: moduleId (uuid, required), " +
	"name (non-empty, required), priority P0-P3, caseType, status, " +
	"preconditions, steps [{id, step, expected, actionScreenshots?, " +
	"expectedScreenshots?}], tags, maintainer, sourceRef. A screenshot group is " +
	"an ordered list of uploadToken values from create_screenshot_upload. " +
	"Rows are validated one by one: an invalid row is reported in `errors` " +
	"with its index and never blocks the rest of the batch.";

export const importBatchSchema = z.object({
	cases: z
		.array(z.unknown())
		.min(1)
		.max(IMPORT_BATCH_LIMIT)
		.describe(CASES_DESCRIPTION),
	onDuplicate: importOnDuplicateSchema.describe(
		"How to handle a case whose sourceRef already exists in the project."
	),
	projectId: z.uuid().describe("Target project id."),
});

export const searchCasesSchema = z.object({
	keyword: z
		.string()
		.min(1)
		.describe("Substring to match against case names (case-insensitive)."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(SEARCH_MAX_LIMIT)
		.optional()
		.describe("Max results (default 20, max 50)."),
	projectId: z.uuid().describe("Project id to search in."),
});
