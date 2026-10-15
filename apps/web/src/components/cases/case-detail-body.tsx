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
import { uploadScreenshotsBeforeSave } from "@/components/cases/step-screenshot-save";
import {
	type CaseSaveConflict,
	caseSaveBaseVersion,
	useUpdateCase,
} from "@/components/cases/use-case-mutations";
import { useCaseNameCheck } from "@/components/cases/use-case-name-check";
import type { StepScreenshotStore } from "@/components/cases/use-step-screenshots";

export const CASE_EDITOR_FORM_ID = "case-editor-form";

const UPLOADING_MESSAGE =
	"还有图片没有上传完成。等上传结束，或者在编辑区下方重试、移除上传失败的图片，再保存。";

function reportSaveError(error: unknown): void {
	toast.error(error instanceof Error ? error.message : "保存失败");
}

interface CaseSaveInput {
	caseId: string;
	checkName: (values: CaseFormValues) => boolean;
	conflict: CaseSaveConflict | null;
	form: CaseFormValues | null;
	mutation: ReturnType<typeof useUpdateCase>["mutation"];
	screenshots: StepScreenshotStore | null;
	testCase: TestCase | undefined;
}

/** 保存：先检查名称和正文图片，再上传新的步骤截图，最后保存用例。 */
function useCaseSave(input: CaseSaveInput) {
	const { caseId, checkName, conflict, form, mutation, screenshots, testCase } =
		input;
	const save = useCallback(async () => {
		if (!(testCase && form) || screenshots?.progress) {
			return;
		}
		if (!checkName(form)) {
			return;
		}
		if (hasUnfinishedCaseUploads(form)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		const uploaded = await uploadScreenshotsBeforeSave(screenshots, form.steps);
		if (uploaded.kind === "failed") {
			return;
		}
		mutation.mutate({
			expectedVersion: caseSaveBaseVersion(testCase.currentVersion, conflict),
			id: caseId,
			patch: { ...formValuesToContent(form), steps: uploaded.steps },
		});
	}, [caseId, checkName, conflict, form, mutation, screenshots, testCase]);

	return useCallback(() => {
		save().catch(reportSaveError);
	}, [save]);
}

export function useCaseEditor(
	caseId: string,
	testCase: TestCase | undefined,
	screenshots: StepScreenshotStore | null = null
) {
	const [form, setForm] = useState<CaseFormValues | null>(null);
	const {
		check: checkName,
		errorFor: nameErrorFor,
		reset: resetNameCheck,
	} = useCaseNameCheck();
	const leaveForm = useCallback(() => {
		setForm(null);
		screenshots?.clear();
	}, [screenshots]);
	const { clearConflict, conflict, mutation } = useUpdateCase(leaveForm);

	const stopEditing = useCallback(() => {
		leaveForm();
		resetNameCheck();
		clearConflict();
	}, [clearConflict, leaveForm, resetNameCheck]);

	const startEditing = useCallback(() => {
		if (testCase) {
			setForm(caseToFormValues(testCase));
		}
	}, [testCase]);

	const handleSave = useCaseSave({
		caseId,
		checkName,
		conflict,
		form,
		mutation,
		screenshots,
		testCase,
	});

	return {
		clearConflict,
		conflict,
		form,
		handleSave,
		nameError: nameErrorFor(form),
		saving: mutation.isPending || Boolean(screenshots?.progress),
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
