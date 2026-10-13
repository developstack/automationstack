import type { TestCase } from "@automationstack/db/schema/test-cases";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CaseDetailView } from "@/components/cases/case-detail-view";
import { CaseForm } from "@/components/cases/case-form";
import {
	type CaseFormValues,
	caseToFormValues,
	formValuesToContent,
} from "@/components/cases/case-meta";
import { hasUnfinishedCaseUploads } from "@/components/cases/case-submit-checks";
import {
	caseSaveBaseVersion,
	useUpdateCase,
} from "@/components/cases/use-case-mutations";
import { useCaseNameCheck } from "@/components/cases/use-case-name-check";

export const CASE_EDITOR_FORM_ID = "case-editor-form";

export function useCaseEditor(caseId: string, testCase: TestCase | undefined) {
	const [form, setForm] = useState<CaseFormValues | null>(null);
	const {
		check: checkName,
		errorFor: nameErrorFor,
		reset: resetNameCheck,
	} = useCaseNameCheck();
	const leaveForm = useCallback(() => setForm(null), []);
	const { clearConflict, conflict, mutation } = useUpdateCase(leaveForm);

	const stopEditing = useCallback(() => {
		setForm(null);
		resetNameCheck();
		clearConflict();
	}, [clearConflict, resetNameCheck]);

	const startEditing = useCallback(() => {
		if (testCase) {
			setForm(caseToFormValues(testCase));
		}
	}, [testCase]);

	const handleSave = useCallback(() => {
		if (!(testCase && form)) {
			return;
		}
		if (!checkName(form)) {
			return;
		}
		if (hasUnfinishedCaseUploads(form)) {
			toast.error("还有图片正在上传，等它传完再保存。");
			return;
		}
		mutation.mutate({
			expectedVersion: caseSaveBaseVersion(testCase.currentVersion, conflict),
			id: caseId,
			patch: formValuesToContent(form),
		});
	}, [caseId, checkName, conflict, form, mutation, testCase]);

	return {
		clearConflict,
		conflict,
		form,
		handleSave,
		nameError: nameErrorFor(form),
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
