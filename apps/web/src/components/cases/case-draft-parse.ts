import type { CaseStep } from "@automationstack/db/schema/test-cases";

import {
	CASE_TYPE_VALUES,
	type CaseFormValues,
	emptyCaseFormValues,
	PRIORITY_VALUES,
	STATUS_VALUES,
} from "@/components/cases/case-meta";

export interface CaseDraftAttachment {
	fileName: string;
	id: string;
	storageKey: string;
}

export interface CaseDraft {
	attachments: CaseDraftAttachment[];
	caseId: string;
	moduleId: string;
	savedAt: number;
	values: CaseFormValues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function pickString(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function pickOption<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T
): T {
	for (const option of allowed) {
		if (option === value) {
			return option;
		}
	}
	return fallback;
}

function parseSteps(value: unknown): CaseStep[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const steps: CaseStep[] = [];
	for (const raw of value) {
		if (isRecord(raw) && typeof raw.id === "string") {
			steps.push({
				expected: pickString(raw.expected, ""),
				id: raw.id,
				step: pickString(raw.step, ""),
			});
		}
	}
	return steps;
}

function parseValues(raw: unknown): CaseFormValues {
	const base = emptyCaseFormValues();
	if (!isRecord(raw)) {
		return base;
	}
	return {
		caseType: pickOption(raw.caseType, CASE_TYPE_VALUES, base.caseType),
		maintainer: pickString(raw.maintainer, base.maintainer),
		name: pickString(raw.name, base.name),
		preconditions: pickString(raw.preconditions, base.preconditions),
		priority: pickOption(raw.priority, PRIORITY_VALUES, base.priority),
		status: pickOption(raw.status, STATUS_VALUES, base.status),
		steps: parseSteps(raw.steps),
		tagsText: pickString(raw.tagsText, base.tagsText),
	};
}

function parseAttachments(value: unknown): CaseDraftAttachment[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const items: CaseDraftAttachment[] = [];
	for (const raw of value) {
		if (
			isRecord(raw) &&
			typeof raw.fileName === "string" &&
			typeof raw.id === "string" &&
			typeof raw.storageKey === "string"
		) {
			items.push({
				fileName: raw.fileName,
				id: raw.id,
				storageKey: raw.storageKey,
			});
		}
	}
	return items;
}

export function parseCaseDraft(raw: string | null): CaseDraft | null {
	if (raw === null) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!(isRecord(parsed) && typeof parsed.caseId === "string")) {
		return null;
	}
	return {
		attachments: parseAttachments(parsed.attachments),
		caseId: parsed.caseId,
		moduleId: pickString(parsed.moduleId, ""),
		savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
		values: parseValues(parsed.values),
	};
}
