import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestAttachmentPresignItem,
	IngestAttachmentRegisterItem,
} from "./attachment-contract";
import { planAttachmentUploads } from "./attachment-reconcile";

export const CASE_A = "11111111-1111-4111-8111-111111111111";
export const CASE_B = "22222222-2222-4222-8222-222222222222";
export const RUN_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
export const RUN_TWO = "bbbbbbbb-2222-4222-8222-222222222222";
export const RUN_CASE_ONE = "cccccccc-1111-4111-8111-111111111111";
export const RUN_CASE_TWO = "dddddddd-2222-4222-8222-222222222222";
export const MIB = 1024 * 1024;

export function screenshot(
	sourceRef: string,
	sizeBytes = 1024
): IngestAttachmentPresignItem {
	return { contentType: "image/png", kind: "screenshot", sizeBytes, sourceRef };
}

export function orphanRow(
	caseId: string,
	sourceRef: string
): AutomationTargetRow {
	return {
		caseId,
		runCaseId: null,
		runId: null,
		runName: null,
		runStatus: null,
		sourceRef,
	};
}

export function targetRow(options: {
	caseId: string;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	status?: AutomationTargetRow["runStatus"];
}): AutomationTargetRow {
	return {
		caseId: options.caseId,
		runCaseId: options.runCaseId,
		runId: options.runId,
		runName: options.runName,
		runStatus: options.status ?? "in_progress",
		sourceRef: options.sourceRef,
	};
}

export function manyRows(count: number): AutomationTargetRow[] {
	return Array.from({ length: count }, (_unused, index) =>
		targetRow({
			caseId: CASE_A,
			runCaseId: `${RUN_CASE_ONE.slice(0, -3)}${String(index).padStart(3, "0")}`,
			runId: RUN_ONE,
			runName: "冒烟",
			sourceRef: `S${index}`,
		})
	);
}

export function registerItem(
	runId: string,
	runCaseId: string
): IngestAttachmentRegisterItem {
	return {
		fileName: "shot.png",
		kind: "screenshot",
		runCaseId,
		runId,
		storageKey: `test-runs/p/${runId}/${runCaseId}/screenshot-x.png`,
	};
}

export const REGRESSION = {
	runCaseId: RUN_CASE_TWO,
	runId: RUN_TWO,
	runName: "回归",
} as const;

export const PENDING_REVIEW = {
	runName: "评审中",
	status: "pending_review",
} as const;

/** 默认是「冒烟」任务里 sourceRef 为 A 的那一行，只写与默认值不同的字段。 */
export function row(
	overrides: Partial<Parameters<typeof targetRow>[0]> = {}
): AutomationTargetRow {
	return targetRow({
		caseId: CASE_A,
		runCaseId: RUN_CASE_ONE,
		runId: RUN_ONE,
		runName: "冒烟",
		sourceRef: "A",
		...overrides,
	});
}

export function plan(
	rows: AutomationTargetRow[],
	runIds: string[] | null = null,
	attachments: IngestAttachmentPresignItem[] = [screenshot("A")]
) {
	return planAttachmentUploads({ attachments, rows, runIds });
}
