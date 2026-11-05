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
	type CaseSaveConflict,
	caseSaveBaseVersion,
	useUpdateCase,
} from "@/components/cases/use-case-mutations";
import { useCaseNameCheck } from "@/components/cases/use-case-name-check";

export const CASE_EDITOR_FORM_ID = "case-editor-form";

const UPLOADING_MESSAGE =
	"还有图片没有上传完成。等上传结束，或者在编辑区下方重试、移除上传失败的图片，再保存。";

interface CaseSaveInput {
	caseId: string;
	checkName: (values: CaseFormValues) => boolean;
	conflict: CaseSaveConflict | null;
	/** 开始编辑时载入的版本。编辑中载入了别人保存的新版本时，保存仍按这个版本检查冲突。 */
	editingVersion: number | null;
	form: CaseFormValues | null;
	mutation: ReturnType<typeof useUpdateCase>["mutation"];
	testCase: TestCase | undefined;
}

/** 保存：先检查名称和正文图片，再保存用例。 */
function useCaseSave(input: CaseSaveInput) {
	const {
		caseId,
		checkName,
		conflict,
		editingVersion,
		form,
		mutation,
		testCase,
	} = input;
	return useCallback(() => {
		if (!(testCase && form)) {
			return;
		}
		if (!checkName(form)) {
			return;
		}
		if (hasUnfinishedCaseUploads(form)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		mutation.mutate({
			expectedVersion: caseSaveBaseVersion(
				editingVersion ?? testCase.currentVersion,
				conflict
			),
			id: caseId,
			patch: formValuesToContent(form),
		});
	}, [caseId, checkName, conflict, editingVersion, form, mutation, testCase]);
}

/** 编辑区的内容，以及开始编辑时载入的版本。 */
function useEditingForm(testCase: TestCase | undefined) {
	const [form, setForm] = useState<CaseFormValues | null>(null);
	const [editingVersion, setEditingVersion] = useState<number | null>(null);
	const leaveForm = useCallback(() => {
		setForm(null);
		setEditingVersion(null);
	}, []);
	const startEditing = useCallback(() => {
		if (testCase) {
			setForm(caseToFormValues(testCase));
			setEditingVersion(testCase.currentVersion);
		}
	}, [testCase]);
	return { editingVersion, form, leaveForm, setForm, startEditing };
}

export function useCaseEditor(caseId: string, testCase: TestCase | undefined) {
	const { editingVersion, form, leaveForm, setForm, startEditing } =
		useEditingForm(testCase);
	const {
		check: checkName,
		errorFor: nameErrorFor,
		reset: resetNameCheck,
	} = useCaseNameCheck();
	const { clearConflict, conflict, mutation } = useUpdateCase(leaveForm);

	const stopEditing = useCallback(() => {
		leaveForm();
		resetNameCheck();
		clearConflict();
	}, [clearConflict, leaveForm, resetNameCheck]);

	const handleSave = useCaseSave({
		caseId,
		checkName,
		conflict,
		editingVersion,
		form,
		mutation,
		testCase,
	});

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
