import type {
	ImportBatchResult,
	ImportCaseRow,
	ImportErrorItem,
} from "@automationstack/db/repositories/case-import-repository";
import {
	IMPORT_BATCH_LIMIT,
	importTestCases,
} from "@automationstack/db/repositories/case-import-repository";
import {
	SEARCH_MAX_LIMIT,
	searchTestCases,
} from "@automationstack/db/repositories/case-search-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure, requireProjectMember } from "../index";
import { publishInvalidate } from "../lib/realtime-publish";
import { importCaseSchema, importOnDuplicateSchema } from "../schemas/case";

const CASES_DESCRIPTION =
	"Cases to import (1-50 per call). Each row: moduleId (uuid, required), " +
	"name (non-empty, required), priority P0-P3, caseType, status, " +
	"preconditions, steps [{id, step, expected}], tags, maintainer, sourceRef. " +
	"Rows are validated one by one: an invalid row is reported in `errors` " +
	"with its index and never blocks the rest of the batch.";

/**
 * Batch-level input only. Row shape is intentionally NOT enforced here:
 * validating each row inside the handler is what keeps one dirty row from
 * rejecting the whole batch (see the per-row parse below).
 */
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

/** Best-effort labels for a row that failed strict validation. */
const rowLabelSchema = z.object({
	name: z.string().catch(""),
	sourceRef: z.string().nullable().catch(null),
});

interface ParsedRows {
	invalidRows: ImportErrorItem[];
	rows: ImportCaseRow[];
}

function rowLabel(row: unknown): { name: string; sourceRef: string | null } {
	const parsed = rowLabelSchema.safeParse(row);
	return parsed.success ? parsed.data : { name: "", sourceRef: null };
}

function issuesMessage(error: z.ZodError): string {
	const details = error.issues
		.map((issue) => {
			const path = issue.path.join(".");
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join("; ");
	return `入参校验失败：${details}`;
}

/** Splits a raw batch into executable rows and per-row validation errors. */
function parseRows(cases: unknown[]): ParsedRows {
	const rows: ImportCaseRow[] = [];
	const invalidRows: ImportErrorItem[] = [];
	for (const [index, row] of cases.entries()) {
		const parsed = importCaseSchema.safeParse(row);
		if (parsed.success) {
			rows.push({ index, item: parsed.data });
		} else {
			const label = rowLabel(row);
			invalidRows.push({
				index,
				message: issuesMessage(parsed.error),
				name: label.name,
				sourceRef: label.sourceRef,
			});
		}
	}
	return { invalidRows, rows };
}

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

async function runImportBatch(
	context: Context,
	input: z.infer<typeof importBatchSchema>
): Promise<ImportBatchResult> {
	const { invalidRows, rows } = parseRows(input.cases);
	const result = await importTestCases({
		actorName: actorName(context),
		onDuplicate: input.onDuplicate,
		projectId: input.projectId,
		rows,
	});
	// 逐条降级语义：部分成功也要广播；整批 0 成功（全 skipped/errors）不广播。
	// 一批可能横跨多个模块，故不带 moduleId——客户端按项目粒度失效即可。
	publishInvalidate({
		action: "create",
		context,
		entity: "case",
		ids: result.created.map((item) => item.caseId),
		projectId: input.projectId,
	});
	return {
		...result,
		errors: [...invalidRows, ...result.errors].sort(
			(left, right) => left.index - right.index
		),
	};
}

/**
 * Bulk-import and search procedures, spread into the `cases` router as
 * cases.importBatch / cases.search. importBatch validates and processes
 * rows one by one (per-row transaction): a row that fails validation or
 * execution lands in `errors` and never aborts the batch.
 */
export const caseImportProcedures = {
	importBatch: protectedProcedure
		.input(importBatchSchema)
		.use(requireProjectMember)
		.handler(({ context, input }) => runImportBatch(context, input)),
	search: protectedProcedure
		.input(searchCasesSchema)
		.use(requireProjectMember)
		.handler(({ input }) => searchTestCases(input)),
};
