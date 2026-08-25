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

/** 与详情抽屉一致：表单本体在 <form> 里，提交按钮在标题栏，靠 id 关联。 */
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

interface CaseCreateContentProps {
	/** 一次草稿会话的全部句柄（表单值、附件、caseId、放弃草稿）。 */
	draft: CaseCreateDraft;
	moduleId: string;
	onCancel: () => void;
	onSubmit: () => void;
	/** 创建请求在飞：按钮变灰、文案换成「创建中…」。 */
	pending: boolean;
	projectId: string;
}

/**
 * 抽屉主体渲染出来的那一整棵：标题栏 + 两条提示 + 表单。
 *
 * 单独一个**模块顶层**组件，而不是主体里的一段 JSX 或内嵌组件：内嵌写法每次
 * 重渲都是一个新的组件类型，React 会把整棵子树拆掉重建——正在打字的输入框会
 * 当场丢焦点，活着的 markdown 编辑器实例也会连同光标位置一起没掉。
 *
 * 这里一个 hook 都不调：所有状态都留在 <CaseCreateBody> 上，本组件只是把它们
 * 摆出来。
 */
function CaseCreateContent({
	draft,
	moduleId,
	onCancel,
	onSubmit,
	pending,
	projectId,
}: CaseCreateContentProps) {
	const { attachments, caseId, discard, setValues, values } = draft;

	// 缓存还没读完（挂载后的第一帧）：此时 caseId 还没定，贴图无处归属。
	// 抽屉本身正在滑入动画里，这一帧看不出区别。
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
	const { attachments, caseId, forget, values } = draft;

	const create = useCaseCreateMutation({ forget, onClose, onCreated });

	// 与详情抽屉同一个约定：dirty 由主体算、报给外壳，卸载时归零。
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
