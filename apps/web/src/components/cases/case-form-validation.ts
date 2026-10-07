import type { CaseFormValues } from "@/components/cases/case-meta";

export const CASE_NAME_FIELD_ID = "case-name";

const NAME_REQUIRED_MESSAGE = "请填写用例名称";

export function validateCaseName(values: CaseFormValues): string | null {
	return values.name.trim() === "" ? NAME_REQUIRED_MESSAGE : null;
}

export function focusCaseNameField(): void {
	document.getElementById(CASE_NAME_FIELD_ID)?.focus();
}
