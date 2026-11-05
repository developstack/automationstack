import { db } from "../index";
import type {
	CasePriority,
	CaseStatus,
	CaseStep,
	CaseType,
	TestCase,
} from "../schema/test-cases";
import {
	insertCaseAttachmentsInTx,
	type NewCaseAttachmentRow,
} from "./case-attachments-repository";
import { findByNameInModule, findBySourceRef } from "./case-import-lookup";
import { createTestCaseInTx } from "./case-mutations-repository";
import { writeCaseMutation } from "./case-snapshot-core";
import type { DbTransaction } from "./repository-types";

export const IMPORT_BATCH_LIMIT = 50;

const OVERWRITE_CHANGE_NOTE = "导入覆盖（sourceRef 匹配）";

const NEW_CASE_SCREENSHOTS_MESSAGE =
	'这一行会新建用例，新用例不能引用截图上传凭证。先导入用例，再用 onDuplicate "overwrite" 和同一个 sourceRef 写入截图';

const FOREIGN_SCREENSHOTS_MESSAGE =
	"截图上传凭证属于另一个用例，不属于 sourceRef 对应的用例";

const SKIPPED_SCREENSHOTS_NOTE =
	'；没有写入截图，写入截图要用 onDuplicate "overwrite"';

export type ImportOnDuplicate = "create-anyway" | "overwrite" | "skip";

export interface ImportCaseInput {
	caseType?: CaseType;
	maintainer?: string | null;
	moduleId: string;
	name: string;
	preconditions?: string | null;
	priority?: CasePriority;
	sourceRef?: string | null;
	status?: CaseStatus;
	steps?: CaseStep[];
	tags?: string[];
}

/**
 * 一行引用的截图上传，已经校验过 R2 中的对象。步骤中的截图已经换成 attachments 的 id。
 * 只能写入 caseId 这条已有的用例：覆盖时登记附件，新建或跳过时不登记。
 */
export interface ImportRowScreenshots {
	attachments: NewCaseAttachmentRow[];
	caseId: string;
}

export interface ImportCaseRow {
	index: number;
	item: ImportCaseInput;
	screenshots?: ImportRowScreenshots;
}

export interface ImportBatchInput {
	actorName: string | null;
	onDuplicate: ImportOnDuplicate;
	projectId: string;
	rows: ImportCaseRow[];
}

export interface ImportCreatedItem {
	action: "created" | "overwritten";
	caseId: string;
	index: number;
	name: string;
	sourceRef: string | null;
	version: number;
	warning?: string;
}

export interface ImportSkippedItem {
	existingCaseId: string;
	index: number;
	name: string;
	reason: string;
	sourceRef: string | null;
}

export interface ImportErrorItem {
	index: number;
	message: string;
	name: string;
	sourceRef: string | null;
}

export interface ImportBatchResult {
	created: ImportCreatedItem[];
	errors: ImportErrorItem[];
	skipped: ImportSkippedItem[];
}

type CaseOutcome =
	| { item: ImportCreatedItem; kind: "created" }
	| { item: ImportErrorItem; kind: "error" }
	| { item: ImportSkippedItem; kind: "skipped" };

interface CaseTask extends ImportCaseRow {
	batch: ImportBatchInput;
}

function errorOutcome(task: CaseTask, message: string): CaseOutcome {
	return {
		item: {
			index: task.index,
			message,
			name: task.item.name,
			sourceRef: task.item.sourceRef ?? null,
		},
		kind: "error",
	};
}

async function createNewCase(
	tx: DbTransaction,
	task: CaseTask,
	options: { sourceRef: string | null; warning?: string }
): Promise<CaseOutcome> {
	if (task.screenshots !== undefined) {
		return errorOutcome(task, NEW_CASE_SCREENSHOTS_MESSAGE);
	}
	const result = await createTestCaseInTx(tx, {
		...task.item,
		actorName: task.batch.actorName,
		projectId: task.batch.projectId,
		sourceRef: options.sourceRef,
	});
	if (result.kind !== "created") {
		return errorOutcome(task, "moduleId 不存在或不属于该项目");
	}
	return {
		item: {
			action: "created",
			caseId: result.testCase.id,
			index: task.index,
			name: result.testCase.name,
			sourceRef: result.testCase.sourceRef,
			version: result.testCase.currentVersion,
			warning: options.warning,
		},
		kind: "created",
	};
}

async function overwriteExisting(
	tx: DbTransaction,
	task: CaseTask,
	existing: TestCase
): Promise<CaseOutcome> {
	if (task.screenshots && task.screenshots.caseId !== existing.id) {
		return errorOutcome(task, FOREIGN_SCREENSHOTS_MESSAGE);
	}
	const result = await writeCaseMutation(tx, {
		actorName: task.batch.actorName,
		caseId: existing.id,
		changeNote: OVERWRITE_CHANGE_NOTE,
		patch: {
			caseType: task.item.caseType,
			maintainer: task.item.maintainer,
			name: task.item.name,
			preconditions: task.item.preconditions,
			priority: task.item.priority,
			status: task.item.status,
			steps: task.item.steps,
			tags: task.item.tags,
		},
	});
	if (result.kind === "conflict" || result.kind === "not-found") {
		return errorOutcome(task, `overwrite 失败（${result.kind}）`);
	}
	// 附件与步骤在同一个事务中写入。附件 id 来自上传凭证，再次导入同一个上传时不重复登记
	await insertCaseAttachmentsInTx(
		tx,
		existing.id,
		task.screenshots?.attachments ?? []
	);
	return {
		item: {
			action: "overwritten",
			caseId: result.testCase.id,
			index: task.index,
			name: result.testCase.name,
			sourceRef: result.testCase.sourceRef,
			version: result.testCase.currentVersion,
		},
		kind: "created",
	};
}

function skippedOutcome(
	task: CaseTask,
	existing: TestCase,
	reason: string
): CaseOutcome {
	return {
		item: {
			existingCaseId: existing.id,
			index: task.index,
			name: task.item.name,
			// 跳过的行不写入截图。明确告诉调用方，不让截图悄悄丢失
			reason:
				task.screenshots === undefined
					? reason
					: `${reason}${SKIPPED_SCREENSHOTS_NOTE}`,
			sourceRef: task.item.sourceRef ?? null,
		},
		kind: "skipped",
	};
}

async function importWithSourceRef(
	tx: DbTransaction,
	task: CaseTask,
	sourceRef: string
): Promise<CaseOutcome> {
	const existing = await findBySourceRef(tx, task.batch.projectId, sourceRef);
	if (!existing) {
		return createNewCase(tx, task, { sourceRef });
	}
	if (task.batch.onDuplicate === "skip") {
		return skippedOutcome(task, existing, "sourceRef 已存在，按 skip 策略跳过");
	}
	if (task.batch.onDuplicate === "overwrite") {
		return overwriteExisting(tx, task, existing);
	}
	return createNewCase(tx, task, {
		sourceRef: null,
		warning:
			"create-anyway：sourceRef 已被占用（唯一约束），新用例以 sourceRef=null 创建，无法参与后续去重",
	});
}

async function importWithoutSourceRef(
	tx: DbTransaction,
	task: CaseTask
): Promise<CaseOutcome> {
	const duplicate = await findByNameInModule(
		tx,
		task.item.moduleId,
		task.item.name
	);
	if (duplicate && task.batch.onDuplicate !== "create-anyway") {
		return skippedOutcome(
			task,
			duplicate,
			"无 sourceRef，目标模块内已有同名用例，跳过（警告：该行无法幂等去重）"
		);
	}
	return createNewCase(tx, task, { sourceRef: null });
}

async function importOneCase(task: CaseTask): Promise<CaseOutcome> {
	const sourceRef = task.item.sourceRef ?? null;
	try {
		return await db.transaction((tx) =>
			sourceRef === null
				? importWithoutSourceRef(tx, task)
				: importWithSourceRef(tx, task, sourceRef)
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			item: { index: task.index, message, name: task.item.name, sourceRef },
			kind: "error",
		};
	}
}

export async function importTestCases(
	input: ImportBatchInput
): Promise<ImportBatchResult> {
	const result: ImportBatchResult = { created: [], errors: [], skipped: [] };
	for (const row of input.rows) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐条独立事务且需保持源文件顺序，必须串行
		const outcome = await importOneCase({ ...row, batch: input });
		if (outcome.kind === "created") {
			result.created.push(outcome.item);
		} else if (outcome.kind === "skipped") {
			result.skipped.push(outcome.item);
		} else {
			result.errors.push(outcome.item);
		}
	}
	return result;
}
