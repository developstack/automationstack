import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { useCallback, useMemo, useState } from "react";

import { CaseForm } from "@/components/cases/case-form";
import {
	type CaseFormValues,
	emptyCaseFormValues,
	formValuesToContent,
} from "@/components/cases/case-meta";
import {
	CASE_SHEET_CONTENT_CLASS,
	isCaseFormDirty,
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
} from "@/components/cases/case-sheet-shell";
import { useCreateCase } from "@/components/cases/use-case-mutations";

/** 与详情抽屉一致：表单本体在 <form> 里，提交按钮在标题栏，靠 id 关联。 */
const CASE_CREATE_FORM_ID = "case-create-form";

interface CaseCreateHeaderProps {
	disabled: boolean;
	onCancel: () => void;
	pending: boolean;
}

function CaseCreateHeader({
	disabled,
	onCancel,
	pending,
}: CaseCreateHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>新建用例</SheetTitle>
			<SheetDescription>用例会创建在当前选中的模块下。</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
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

interface CaseCreateBodyProps {
	moduleId: string;
	onCancel: () => void;
	onCreated: (caseId: string) => void;
	onValuesChange: (values: CaseFormValues) => void;
	projectId: string;
	values: CaseFormValues;
}

function CaseCreateBody({
	moduleId,
	onCancel,
	onCreated,
	onValuesChange,
	projectId,
	values,
}: CaseCreateBodyProps) {
	const create = useCreateCase(onCreated);
	const disabled = create.isPending || values.name.trim() === "";

	const handleSubmit = useCallback(() => {
		if (values.name.trim() === "") {
			return;
		}
		create.mutate({
			...formValuesToContent(values),
			moduleId,
			projectId,
		});
	}, [create, moduleId, projectId, values]);

	return (
		<>
			<CaseCreateHeader
				disabled={disabled}
				onCancel={onCancel}
				pending={create.isPending}
			/>
			<Separator />
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<CaseForm
					formId={CASE_CREATE_FORM_ID}
					onChange={onValuesChange}
					onSubmit={handleSubmit}
					values={values}
				/>
			</div>
		</>
	);
}

interface CaseCreateSheetProps {
	/** undefined when no module is selected — creation needs a target module. */
	moduleId: string | undefined;
	onClose: () => void;
	onCreated: (caseId: string) => void;
	open: boolean;
	projectId: string;
}

/**
 * 新建用例。与详情抽屉共用 CASE_SHEET_CONTENT_CLASS —— 同一个宽度、
 * 同一套字号、同一个 <CaseForm>，替掉了原来那个 384px 的 Dialog。
 */
export function CaseCreateSheet(props: CaseCreateSheetProps) {
	const [values, setValues] = useState<CaseFormValues>(emptyCaseFormValues);
	const baseline = useMemo(() => emptyCaseFormValues(), []);
	const open = props.open && props.moduleId !== undefined;

	const close = useCallback(() => {
		setValues(emptyCaseFormValues());
		props.onClose();
	}, [props.onClose]);
	const guard = useUnsavedCloseGuard(isCaseFormDirty(values, baseline), close);
	/**
	 * 标题栏的「取消」= 关抽屉，与 Esc / 点外面 / 右上角 × 同一个后果，
	 * 所以它也必须走守卫；确认之后走的仍然是上面那个 close（含表单重置）。
	 * useCallback 稳住引用，避免 CaseCreateBody 每次 render 都拿到新函数。
	 */
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const handleCreated = useCallback(
		(caseId: string) => {
			setValues(emptyCaseFormValues());
			props.onCreated(caseId);
		},
		[props.onCreated]
	);

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={CASE_SHEET_CONTENT_CLASS} side="right">
					{open && props.moduleId ? (
						<CaseCreateBody
							moduleId={props.moduleId}
							onCancel={requestClose}
							onCreated={handleCreated}
							onValuesChange={setValues}
							projectId={props.projectId}
							values={values}
						/>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
			/>
		</>
	);
}
