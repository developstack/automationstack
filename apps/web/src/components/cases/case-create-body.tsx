import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { useEffect, useMemo } from "react";

import { CaseAttachmentProvider } from "@/components/cases/case-attachment-context";
import { CaseDraftNotice } from "@/components/cases/case-draft-notice";
import { CaseDraftPicker } from "@/components/cases/case-draft-picker";
import { CaseForm } from "@/components/cases/case-form";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import { emptyCaseFormValues } from "@/components/cases/case-meta";
import {
	type CaseCreateDraft,
	useCaseCreateDraft,
} from "@/components/cases/use-case-create-draft";
import {
	useCaseCreateMutation,
	useCaseCreateSubmit,
} from "@/components/cases/use-case-create-submit";

const CASE_CREATE_FORM_ID = "case-create-form";

interface CaseCreateHeaderProps {
	disabled: boolean;
	onCancel: () => void;
	pending: boolean;
	uploading: boolean;
}

function CaseCreateHeader({
	disabled,
	onCancel,
	pending,
	uploading,
}: CaseCreateHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>新建用例</SheetTitle>
			<SheetDescription>用例会创建在当前选中的模块下。</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
				{uploading ? (
					<span className="text-muted-foreground text-xs">图片上传中…</span>
				) : null}
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					disabled={disabled}
					form={CASE_CREATE_FORM_ID}
					size="sm"
					type="submit"
				>
					{pending ? "创建中…" : "创建"}
				</Button>
			</div>
		</SheetHeader>
	);
}

interface CaseCreateContentProps {
	draft: CaseCreateDraft;
	moduleId: string;
	onCancel: () => void;
	onSubmit: () => void;
	pending: boolean;
	projectId: string;
}

function CaseCreateContent({
	draft,
	moduleId,
	onCancel,
	onSubmit,
	pending,
	projectId,
}: CaseCreateContentProps) {
	const { attachments, caseId, discard, setValues, values } = draft;

	if (caseId === null) {
		return null;
	}

	const disabled =
		pending || attachments.uploading || values.name.trim() === "";

	return (
		<CaseAttachmentProvider value={attachments}>
			<CaseCreateHeader
				disabled={disabled}
				onCancel={onCancel}
				pending={pending}
				uploading={attachments.uploading}
			/>
			<CaseDraftNotice
				missing={draft.missing}
				onDiscard={discard}
				restoredAt={draft.restoredAt}
			/>
			<CaseDraftPicker
				currentCaseId={caseId}
				moduleId={moduleId}
				projectId={projectId}
			/>
			<Separator />
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<CaseForm
					formId={CASE_CREATE_FORM_ID}
					onChange={setValues}
					onSubmit={onSubmit}
					values={values}
				/>
			</div>
		</CaseAttachmentProvider>
	);
}

export interface CaseCreateBodyProps {
	draftId: string | undefined;
	moduleId: string;
	onCancel: () => void;
	onClose: () => void;
	onCreated: (caseId: string) => void;
	onDirtyChange: (dirty: boolean) => void;
	projectId: string;
}

export function CaseCreateBody(props: CaseCreateBodyProps) {
	const {
		draftId,
		moduleId,
		onCancel,
		onClose,
		onCreated,
		onDirtyChange,
		projectId,
	} = props;
	const baseline = useMemo(() => emptyCaseFormValues(), []);
	const draft = useCaseCreateDraft(projectId, moduleId, draftId);
	const { attachments, caseId, forget, values } = draft;

	const create = useCaseCreateMutation({ forget, onClose, onCreated });

	const dirty = isCaseFormDirty(values, baseline);
	useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	const handleSubmit = useCaseCreateSubmit({
		attachments,
		caseId,
		create,
		moduleId,
		projectId,
		values,
	});

	return (
		<CaseCreateContent
			draft={draft}
			moduleId={moduleId}
			onCancel={onCancel}
			onSubmit={handleSubmit}
			pending={create.isPending}
			projectId={projectId}
		/>
	);
}
