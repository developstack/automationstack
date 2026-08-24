/**
 * 新建测试任务。
 *
 * 原先是 max-w-5xl、h-4/5 的 Dialog，与「编辑」挤在同一个组件的一个三元里。
 * 现在换成与用例那两个抽屉同宽的大抽屉（WIDE_SHEET_CONTENT_CLASS）：这里要
 * 放下一整棵模块树 + 一页用例表，1024px 挑用例本来就挤。
 * 编辑仍然是窄对话框（test-run-edit-dialog.tsx）——那边只有两个文本框，
 * 给它开 1280px 是把「同一个组件用同一套壳」误读成「所有弹层都得长一样」。
 *
 * 提交按钮在标题栏、靠 form id 关联表单本体，与用例抽屉一致：抽屉是满高的，
 * 底部按钮会离标题一整屏远，而这里的主体（用例选择器）自己还要滚。
 */
import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { type FormEvent, useCallback, useState } from "react";

import { CasePicker } from "@/components/test-runs/case-picker";
import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { RunFields } from "@/components/test-runs/test-run-fields";
import { useCreateTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

const CREATE_FORM_ID = "test-run-create-form";
const CREATE_HINT_ID = "test-run-create-hint";

const EMPTY_DRAFT: TestRunDraft = { caseIds: [], description: "", name: "" };

interface CreateHeaderProps {
	blocked: boolean;
	/** 按钮为什么点不动；提交中为 null（那不算「缺东西」）。 */
	hint: string | null;
	onCancel: () => void;
	pending: boolean;
}

function CreateHeader({ blocked, hint, onCancel, pending }: CreateHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>新建测试任务</SheetTitle>
			<SheetDescription>填写名称并勾选这一轮要测的用例。</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
				{/*
				 * 禁用必须说明原因，否则用户只看到一个点不动的按钮。
				 * 这句话同时挂在按钮的 aria-describedby 上，读屏聚到按钮就能听见。
				 */}
				{hint === null ? null : (
					<p
						className="mr-auto text-muted-foreground text-sm"
						id={CREATE_HINT_ID}
					>
						{hint}
					</p>
				)}
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					aria-describedby={hint === null ? undefined : CREATE_HINT_ID}
					aria-disabled={blocked}
					form={CREATE_FORM_ID}
					size="sm"
					type="submit"
				>
					{pending ? "创建中…" : "创建"}
				</Button>
			</div>
		</SheetHeader>
	);
}

/** 按钮点不动时的原因文案；提交中不显示。 */
function blockedHint(draft: TestRunDraft, pending: boolean): string | null {
	if (pending) {
		return null;
	}
	if (draft.name.trim() === "") {
		return "请先填写测试任务名称。";
	}
	if (draft.caseIds.length === 0) {
		return "请至少勾选一条用例。";
	}
	return null;
}

interface TestRunCreateSheetProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

export function TestRunCreateSheet({
	onClose,
	open,
	projectId,
}: TestRunCreateSheetProps) {
	/*
	 * 草稿留在抽屉组件里（而不是随内容一起卸载）：守卫要在关闭**之前**
	 * 知道有没有改动。内容仍然按 open 卸载，关掉再打开不会带上一次的残留。
	 */
	const [draft, setDraft] = useState<TestRunDraft>(EMPTY_DRAFT);

	const close = useCallback(() => {
		setDraft(EMPTY_DRAFT);
		onClose();
	}, [onClose]);
	const create = useCreateTestRun(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(draft, EMPTY_DRAFT),
		close
	);
	/** 标题栏的「取消」= 关抽屉，与 Esc / 点外面 / 右上角 × 同一个后果。 */
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const setName = useCallback(
		(name: string) => setDraft((prev) => ({ ...prev, name })),
		[]
	);
	const setDescription = useCallback(
		(description: string) => setDraft((prev) => ({ ...prev, description })),
		[]
	);
	const setCaseIds = useCallback(
		(caseIds: string[]) => setDraft((prev) => ({ ...prev, caseIds })),
		[]
	);

	// 后端也会以 `empty-cases` 拒绝（BAD_REQUEST），但前端这一道不能省：
	// 让人填完整个表单、点了创建、再被弹一条红字打回来，是最难受的一种失败。
	const blocked =
		draft.name.trim() === "" || draft.caseIds.length === 0 || create.isPending;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate({
				caseIds: draft.caseIds,
				description: draft.description.trim() === "" ? null : draft.description,
				name: draft.name.trim(),
				projectId,
			});
		},
		[blocked, create, draft, projectId]
	);

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<CreateHeader
								blocked={blocked}
								hint={blockedHint(draft, create.isPending)}
								onCancel={requestClose}
								pending={create.isPending}
							/>
							<Separator />
							{/*
							 * 表单自己是 min-h-0 的弹性列：用例选择器内部还有一层
							 * 可滚区域（模块树 / 用例表），外层不能跟着一起长高，
							 * 否则标题栏和分页条会被顶出视口。
							 */}
							<form
								className="flex min-h-0 flex-1 flex-col gap-4 p-4"
								id={CREATE_FORM_ID}
								onSubmit={handleSubmit}
							>
								<RunFields
									description={draft.description}
									name={draft.name}
									onDescriptionChange={setDescription}
									onNameChange={setName}
								/>
								<div className="flex min-h-0 flex-1 flex-col gap-2">
									<p className="font-medium text-sm">选择用例</p>
									<CasePicker
										onChange={setCaseIds}
										projectId={projectId}
										selectedIds={draft.caseIds}
									/>
								</div>
							</form>
						</>
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
