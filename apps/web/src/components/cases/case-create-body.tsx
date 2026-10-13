import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { useEffect, useMemo } from "react";

import { CaseAttachmentProvider } from "@/components/cases/case-attachment-context";
import {
	CASE_SHEET_HEADER_CLASS,
	CASE_SHEET_TITLE_CLASS,
} from "@/components/cases/case-detail-header";
import { CaseDraftNotice } from "@/components/cases/case-draft-notice";
import { CaseDraftPicker } from "@/components/cases/case-draft-picker";
import { CaseForm } from "@/components/cases/case-form";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import { CaseHeaderMeta } from "@/components/cases/case-header-meta";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
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
	caseId: string;
	onCancel: () => void;
	pending: boolean;
	uploading: boolean;
	values: CaseFormValues;
}

function CaseCreateHeader({
	caseId,
	onCancel,
	pending,
	uploading,
	values,
}: CaseCreateHeaderProps) {
	return (
		<SheetHeader className={CASE_SHEET_HEADER_CLASS}>
			<CaseHeaderMeta
				caseId={caseId}
				priority={values.priority}
				status={values.status}
			/>
			<SheetTitle className={CASE_SHEET_TITLE_CLASS}>新建用例</SheetTitle>
			<SheetDescription className="text-xs">
				用例创建在当前选中的模块下。编号、用例状态和优先级是创建后的值。
			</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-1">
				{uploading ? (
					<span className="text-muted-foreground text-xs" role="status">
						图片上传中…
					</span>
				) : null}
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					disabled={uploading}
					form={CASE_CREATE_FORM_ID}
					pending={pending}
					size="sm"
					type="submit"
				>
					创建
				</Button>
			</div>
		</SheetHeader>
	);
}

interface CaseCreateContentProps {
	draft: CaseCreateDraft;
	moduleId: string;
	nameError: string | null;
	onCancel: () => void;
	onSubmit: () => void;
	pending: boolean;
	projectId: string;
}

function CaseCreateContent({
	draft,
	moduleId,
	nameError,
	onCancel,
	onSubmit,
	pending,
	projectId,
}: CaseCreateContentProps) {
	const { attachments, caseId, discard, setValues, values } = draft;

	if (caseId === null) {
		return null;
	}

	return (
		<CaseAttachmentProvider value={attachments}>
			<CaseCreateHeader
				caseId={caseId}
				onCancel={onCancel}
				pending={pending}
				uploading={attachments.uploading}
				values={values}
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
					nameError={nameError ?? undefined}
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

	const submit = useCaseCreateSubmit({
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
			nameError={submit.nameError}
			onCancel={onCancel}
			onSubmit={submit.submit}
			pending={create.isPending}
			projectId={projectId}
		/>
	);
}
