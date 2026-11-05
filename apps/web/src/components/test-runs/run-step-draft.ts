import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

const STORAGE_PREFIX = "automationstack.run-step-draft.";

const STEP_RESULT_VALUES: readonly TestRunStepResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export interface RunStepDraft {
	/** 每个步骤的实际结果文字，按步骤 id 索引。 */
	actualResults: Record<string, string>;
	caseVersion: number;
	judged: Record<string, TestRunStepResult>;
	savedAt: number;
}

function localStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function draftKey(runCaseId: string): string {
	return `${STORAGE_PREFIX}${runCaseId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJudged(value: unknown): Record<string, TestRunStepResult> {
	if (!isRecord(value)) {
		return {};
	}
	const judged: Record<string, TestRunStepResult> = {};
	for (const [stepId, result] of Object.entries(value)) {
		if (STEP_RESULT_VALUES.includes(result as TestRunStepResult)) {
			judged[stepId] = result as TestRunStepResult;
		}
	}
	return judged;
}

function parseActualResults(value: unknown): Record<string, string> {
	if (!isRecord(value)) {
		return {};
	}
	const actualResults: Record<string, string> = {};
	for (const [stepId, text] of Object.entries(value)) {
		if (typeof text === "string") {
			actualResults[stepId] = text;
		}
	}
	return actualResults;
}

export function parseRunStepDraft(raw: string | null): RunStepDraft | null {
	if (raw === null) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) {
		return null;
	}
	const { caseVersion, savedAt } = parsed;
	if (typeof caseVersion !== "number" || !Number.isInteger(caseVersion)) {
		return null;
	}
	return {
		// #78 之前的草稿把失败原因和阻塞原因存在 comments 键中，读出来作为实际结果
		actualResults: parseActualResults(parsed.actualResults ?? parsed.comments),
		caseVersion,
		judged: parseJudged(parsed.judged),
		savedAt: typeof savedAt === "number" ? savedAt : 0,
	};
}

export type RunStepDraftLookup =
	| { draft: RunStepDraft; kind: "ok" }
	| { kind: "none" }
	| { kind: "stale" };

export function readRunStepDraft(
	runCaseId: string,
	caseVersion: number
): RunStepDraftLookup {
	let draft: RunStepDraft | null = null;
	try {
		draft = parseRunStepDraft(
			localStore()?.getItem(draftKey(runCaseId)) ?? null
		);
	} catch {
		return { kind: "none" };
	}
	if (draft === null) {
		return { kind: "none" };
	}
	if (draft.caseVersion !== caseVersion) {
		clearRunStepDraft(runCaseId);
		return { kind: "stale" };
	}
	return { draft, kind: "ok" };
}

export function writeRunStepDraft(
	runCaseId: string,
	draft: Omit<RunStepDraft, "savedAt">
): void {
	try {
		localStore()?.setItem(
			draftKey(runCaseId),
			JSON.stringify({ ...draft, savedAt: Date.now() })
		);
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
}

export function clearRunStepDraft(runCaseId: string): void {
	try {
		localStore()?.removeItem(draftKey(runCaseId));
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
}
