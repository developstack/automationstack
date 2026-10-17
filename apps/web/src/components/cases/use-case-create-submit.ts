import { useCallback } from "react";
import { toast } from "sonner";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { formValuesToContent } from "@/components/cases/case-meta";
import {
	hasUnfinishedCaseUploads,
	referencedCaseAttachments,
} from "@/components/cases/case-submit-checks";
import type { CaseDraftAttachments } from "@/components/cases/use-case-draft-attachments";
import { useCreateCase } from "@/components/cases/use-case-mutations";
import { useCaseNameCheck } from "@/components/cases/use-case-name-check";

const UPLOADING_MESSAGE =
	"还有图片没有上传完成。等上传结束，或者在编辑区下方重试、移除上传失败的图片，再创建。";

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

	const submit = useCallback(() => {
		if (caseId === null) {
			return;
		}
		if (!checkName(values)) {
			return;
		}
		if (hasUnfinishedCaseUploads(values)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		create.mutate({
			...formValuesToContent(values),
			attachments: referencedCaseAttachments(values, attachments.pending),
			id: caseId,
			moduleId,
			projectId,
		});
	}, [
		attachments.pending,
		caseId,
		checkName,
		create,
		moduleId,
		projectId,
		values,
	]);

	return { nameError: nameErrorFor(values), submit };
}
