/**
 * Read/edit half of the case detail sheet: the `useCaseEditor` state machine
 * plus the component that renders either the read view or the inline form.
 * Kept out of `case-detail-sheet.tsx` so neither file grows past the 300-line
 * budget.
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { useCallback, useState } from "react";

import { CaseDetailView } from "@/components/cases/case-detail-view";
import { CaseForm } from "@/components/cases/case-form";
import {
	focusCaseNameField,
	validateCaseName,
} from "@/components/cases/case-form-validation";
import {
	type CaseFormValues,
	caseToFormValues,
	formValuesToContent,
} from "@/components/cases/case-meta";
import { useUpdateCase } from "@/components/cases/use-case-mutations";

/** <form> 与面板标题栏里的「保存」按钮靠这个 id 关联（按钮在表单之外）。 */
export const CASE_EDITOR_FORM_ID = "case-editor-form";

/**
 * Read/edit state for one case. Saving always carries the `currentVersion`
 * read back from the server as `expectedVersion` (optimistic lock).
 */
export function useCaseEditor(caseId: string, testCase: TestCase | undefined) {
	const [form, setForm] = useState<CaseFormValues | null>(null);
	const [nameError, setNameError] = useState<string | null>(null);
	const leaveForm = useCallback(() => setForm(null), []);
	const { clearConflict, conflict, mutation } = useUpdateCase(leaveForm);

	const stopEditing = useCallback(() => {
		setForm(null);
		setNameError(null);
		clearConflict();
	}, [clearConflict]);

	const startEditing = useCallback(() => {
		if (testCase) {
			setForm(caseToFormValues(testCase));
		}
	}, [testCase]);

	const handleSave = useCallback(() => {
		if (!(testCase && form)) {
			return;
		}
		const error = validateCaseName(form);
		setNameError(error);
		if (error !== null) {
			focusCaseNameField();
			return;
		}
		mutation.mutate({
			expectedVersion: testCase.currentVersion,
			id: caseId,
			patch: formValuesToContent(form),
		});
	}, [caseId, form, mutation, testCase]);

	return {
		clearConflict,
		conflict,
		form,
		handleSave,
		nameError,
		saving: mutation.isPending,
		setForm,
		startEditing,
		stopEditing,
	};
}

export type CaseEditor = ReturnType<typeof useCaseEditor>;

interface CaseDetailBodyProps {
	editor: CaseEditor;
	testCase: TestCase;
}

/** 详情 tab 的内容：只读视图或行内编辑表单（版本历史在另一个 tab）。 */
export function CaseDetailBody({ editor, testCase }: CaseDetailBodyProps) {
	if (editor.form) {
		return (
			<CaseForm
				formId={CASE_EDITOR_FORM_ID}
				nameError={editor.nameError ?? undefined}
				onChange={editor.setForm}
				onSubmit={editor.handleSave}
				values={editor.form}
			/>
		);
	}
	return <CaseDetailView testCase={testCase} />;
}
