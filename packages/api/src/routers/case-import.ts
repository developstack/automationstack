import type {
	ImportBatchResult,
	ImportCaseRow,
	ImportErrorItem,
} from "@automationstack/db/repositories/case-import-repository";
import { importTestCases } from "@automationstack/db/repositories/case-import-repository";
import { searchTestCases } from "@automationstack/db/repositories/case-search-repository";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure, requireProjectMember } from "../index";
import { resolveColumnScreenshotUploads } from "../lib/case-screenshot-uploads";
import { getR2Storage } from "../lib/r2";
import { publishInvalidate } from "../lib/realtime-publish";
import { importCaseSchema } from "../schemas/case";
import { importBatchSchema, searchCasesSchema } from "../schemas/case-import";

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

/**
 * 把每行步骤中的截图上传凭证换成附件 id。凭证无效、过期、属于另一个用户或文件不存在的行
 * 放进错误，不影响其他行。
 */
async function resolveRowScreenshots(
	parsed: ParsedRows,
	target: { projectId: string; userId: string | null }
): Promise<ParsedRows> {
	const context = {
		...target,
		now: Date.now(),
		secret: env.SESSION_SECRET,
		storage: getR2Storage(),
	};
	const resolved = await Promise.all(
		parsed.rows.map(async (row) => ({
			result: await resolveColumnScreenshotUploads(
				row.item.steps ?? [],
				context
			),
			row,
		}))
	);
	const rows: ImportCaseRow[] = [];
	const invalidRows = [...parsed.invalidRows];
	for (const { result, row } of resolved) {
		if (result.kind === "none") {
			rows.push(row);
		} else if (result.kind === "error") {
			invalidRows.push({
				index: row.index,
				message: result.message,
				...rowLabel(row.item),
			});
		} else {
			const { attachments, caseId, steps } = result;
			rows.push({
				...row,
				item: { ...row.item, steps },
				screenshots: { attachments, caseId },
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
	const { invalidRows, rows } = await resolveRowScreenshots(
		parseRows(input.cases),
		{ projectId: input.projectId, userId: context.user?.id ?? null }
	);
	const result = await importTestCases({
		actorName: actorName(context),
		onDuplicate: input.onDuplicate,
		projectId: input.projectId,
		rows,
	});
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
