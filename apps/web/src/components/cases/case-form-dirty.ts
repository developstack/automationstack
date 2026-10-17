import type { CaseFormValues } from "@/components/cases/case-meta";

function caseFormFingerprint(values: CaseFormValues): string {
	return JSON.stringify([
		values.caseType,
		values.maintainer,
		values.name,
		values.preconditions,
		values.priority,
		values.status,
		values.tagsText,
		values.steps.map((step) => [step.id, step.step, step.expected]),
	]);
}

export function isCaseFormDirty(
	values: CaseFormValues | null,
	baseline: CaseFormValues
): boolean {
	if (values === null) {
		return false;
	}
	return caseFormFingerprint(values) !== caseFormFingerprint(baseline);
}
