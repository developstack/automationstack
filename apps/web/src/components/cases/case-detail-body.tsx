import type { TestCase } from "@automationstack/db/schema/test-cases";
import { useCallback, useState } from "react";
import { toast } from "sonner";
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
import { hasUnfinishedCaseUploads } from "@/components/cases/case-submit-checks";
import { useUpdateCase } from "@/components/cases/use-case-mutations";

export const CASE_EDITOR_FORM_ID = "case-editor-form";

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
		if (hasUnfinishedCaseUploads(form)) {
			toast.error("还有图片正在上传，等它传完再保存。");
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
