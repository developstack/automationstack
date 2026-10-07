import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type { IngestExecutionResult } from "./execution-contract";

export const CASE_A = "11111111-1111-4111-8111-111111111111";
export const CASE_B = "22222222-2222-4222-8222-222222222222";
export const RUN_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
export const RUN_TWO = "bbbbbbbb-2222-4222-8222-222222222222";

export function passed(
	sourceRef: string,
	message?: string
): IngestExecutionResult {
	return { message: message ?? null, result: "passed", sourceRef };
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
