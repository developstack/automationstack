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

const UPLOADING_MESSAGE = "还有图片正在上传，等它传完再创建。";

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

export function useCaseCreateSubmit(input: CaseCreateSubmitInput): () => void {
	const { attachments, caseId, create, moduleId, projectId, values } = input;

	return useCallback(() => {
		if (caseId === null || values.name.trim() === "") {
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
	}, [attachments.pending, caseId, create, moduleId, projectId, values]);
}
