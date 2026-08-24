/**
 * 新建抽屉的主体：标题栏 + 草稿提示条 + 表单，以及「点创建」那一刻做的全部判断。
 *
 * 与 `case-create-sheet.tsx` 分开，是因为抽屉外壳（宽度、二次确认）与草稿态
 * （预生成 id、本地缓存、待登记附件）是两件互不相干的事，合在一个文件里
 * 两边都会挤破 300 行。
 *
 * 主体只在抽屉打开时挂载，于是「一次打开 = 一次草稿会话」就是一次普通的挂载
 * effect（见 `use-case-create-draft.ts`）。
 *
 * 标题栏下方、表单之上摞着两条提示，都不会自动改动表单里的一个字：
 * `CaseDraftNotice` 说「这份内容是恢复出来的 / 你要的那份不在了」，
 * `CaseDraftPicker` 说「这个模块还有别的草稿没写完」。
 */
import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { CaseAttachmentProvider } from "@/components/cases/case-attachment-context";
import { CaseDraftNotice } from "@/components/cases/case-draft-notice";
import { CaseDraftPicker } from "@/components/cases/case-draft-picker";
import { CaseForm } from "@/components/cases/case-form";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import {
	emptyCaseFormValues,
	formValuesToContent,
} from "@/components/cases/case-meta";
import {
	hasUnfinishedCaseUploads,
	referencedCaseAttachments,
} from "@/components/cases/case-submit-checks";
import { useCaseCreateDraft } from "@/components/cases/use-case-create-draft";
import { useCreateCase } from "@/components/cases/use-case-mutations";

/** 与详情抽屉一致：表单本体在 <form> 里，提交按钮在标题栏，靠 id 关联。 */
const CASE_CREATE_FORM_ID = "case-create-form";

const UPLOADING_MESSAGE = "还有图片正在上传，等它传完再创建。";

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
				{/* 光把按钮变灰是说不清原因的，用户只会以为是自己名称没填。 */}
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

export interface CaseCreateBodyProps {
	/** URL 上 `?draft=` 指名要恢复的草稿；不带就是一张空表单。 */
	draftId: string | undefined;
	moduleId: string;
	onCancel: () => void;
	/** 抽屉自己关掉（创建成功、或撞上「已经建过了」）。 */
	onClose: () => void;
	onCreated: (caseId: string) => void;
	/** 把「有未保存改动」报给抽屉外壳，供关闭前的二次确认使用。 */
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
	const { attachments, caseId, discard, forget, setValues, values } = draft;

	const handleCreated = useCallback(
		(newCaseId: string) => {
			forget();
			onCreated(newCaseId);
		},
		[forget, onCreated]
	);
	const handleDuplicate = useCallback(() => {
		// 这条用例已经在库里了，草稿再留着只会被反复提交。清掉并把抽屉收起来，
		// 让用户回到列表——那条用例就在列表里。
		forget();
		onClose();
	}, [forget, onClose]);
	const create = useCreateCase({
		onCreated: handleCreated,
		onDuplicate: handleDuplicate,
	});

	// 与详情抽屉同一个约定：dirty 由主体算、报给外壳，卸载时归零。
	const dirty = isCaseFormDirty(values, baseline);
	useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	const handleSubmit = useCallback(() => {
		if (caseId === null || values.name.trim() === "") {
			return;
		}
		/**
		 * 第二道防线。按钮在上传期间是禁用的，但表单里任意输入框按回车都会提交，
		 * 那条路绕过按钮。带着 `![](uploading:<token>)` 提交的后果是不可逆的：
		 * 抽屉一关，上传回来时既找不到编辑器也找不到这份表单值，正文里会永久
		 * 留下一处渲染成「图片上传中…」的死引用，还会被冻进 v1 的版本快照。
		 */
		if (hasUnfinishedCaseUploads(values)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		create.mutate({
			...formValuesToContent(values),
			// 只提交正文里**仍然**被引用的那些：贴了图又把那段删掉的，不登记。
			attachments: referencedCaseAttachments(values, attachments.pending),
			id: caseId,
			moduleId,
			projectId,
		});
	}, [attachments.pending, caseId, create, moduleId, projectId, values]);

	// 缓存还没读完（挂载后的第一帧）：此时 caseId 还没定，贴图无处归属。
	// 抽屉本身正在滑入动画里，这一帧看不出区别。
	if (caseId === null) {
		return null;
	}

	const disabled =
		create.isPending || attachments.uploading || values.name.trim() === "";

	return (
		<CaseAttachmentProvider value={attachments}>
			<CaseCreateHeader
				disabled={disabled}
				onCancel={onCancel}
				pending={create.isPending}
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
					onSubmit={handleSubmit}
					values={values}
				/>
			</div>
		</CaseAttachmentProvider>
	);
}
