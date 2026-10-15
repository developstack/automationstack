import { useCallback } from "react";
import { toast } from "sonner";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { formValuesToContent } from "@/components/cases/case-meta";
import {
	hasUnfinishedCaseUploads,
	referencedCaseAttachments,
} from "@/components/cases/case-submit-checks";
import {
	mergeDraftAttachments,
	uploadScreenshotsBeforeSave,
} from "@/components/cases/step-screenshot-save";
import type { CaseDraftAttachments } from "@/components/cases/use-case-draft-attachments";
import { useCreateCase } from "@/components/cases/use-case-mutations";
import { useCaseNameCheck } from "@/components/cases/use-case-name-check";

const UPLOADING_MESSAGE =
	"还有图片没有上传完成。等上传结束，或者在编辑区下方重试、移除上传失败的图片，再创建。";

function reportSubmitError(error: unknown): void {
	toast.error(error instanceof Error ? error.message : "创建失败");
}

export type CaseCreateMutation = ReturnType<typeof useCreateCase>;

export interface CaseCreateMutationInput {
	forget: () => void;
	onClose: () => void;
	onCreated: (caseId: string) => void;
}

export function useCaseCreateMutation(
	input: CaseCreateMutationInput
): CaseCreateMutation {
	const { forget, onClose, onCreated } = input;

	const handleCreated = useCallback(
		(newCaseId: string) => {
			forget();
			onCreated(newCaseId);
		},
		[forget, onCreated]
	);
	const handleDuplicate = useCallback(() => {
		forget();
		onClose();
	}, [forget, onClose]);

	return useCreateCase({
		onCreated: handleCreated,
		onDuplicate: handleDuplicate,
	});
}

export interface CaseCreateSubmitInput {
	attachments: CaseDraftAttachments;
	caseId: string | null;
	create: CaseCreateMutation;
	moduleId: string;
	projectId: string;
	values: CaseFormValues;
}

export interface CaseCreateSubmit {
	/** 名称字段旁边显示的错误。没有错误时为 null。 */
	nameError: string | null;
	submit: () => void;
}

export function useCaseCreateSubmit(
	input: CaseCreateSubmitInput
): CaseCreateSubmit {
	const { attachments, caseId, create, moduleId, projectId, values } = input;
	const { check: checkName, errorFor: nameErrorFor } = useCaseNameCheck();

	const { screenshots } = attachments;
	const save = useCallback(async () => {
		if (caseId === null || screenshots.progress) {
			return;
		}
		if (!checkName(values)) {
			return;
		}
		if (hasUnfinishedCaseUploads(values)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		const uploaded = await uploadScreenshotsBeforeSave(
			screenshots,
			values.steps
		);
		if (uploaded.kind === "failed") {
			return;
		}
		create.mutate({
			...formValuesToContent(values),
			attachments: mergeDraftAttachments(
				referencedCaseAttachments(values, attachments.pending),
				uploaded.attachments
			),
			id: caseId,
			moduleId,
			projectId,
			steps: uploaded.steps,
		});
	}, [
		attachments.pending,
		caseId,
		checkName,
		create,
		moduleId,
		projectId,
		screenshots,
		values,
	]);

	const submit = useCallback(() => {
		save().catch(reportSubmitError);
	}, [save]);

	return { nameError: nameErrorFor(values), submit };
}
