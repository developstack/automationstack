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
 *
 * 状态与写操作全在 test-run-create-draft.ts 的 useCreateRunDraft 里，本文件
 * 只剩壳与排版；那边文件头写了为什么它必须是一个 hook 而不是一个子组件。
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

import { CasePicker } from "@/components/test-runs/case-picker";
import {
	type CreateRunController,
	useCreateRunDraft,
} from "@/components/test-runs/test-run-create-draft";
import { RunFields } from "@/components/test-runs/test-run-fields";
import {
	UnsavedChangesDialog,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

const CREATE_FORM_ID = "test-run-create-form";
const CREATE_HINT_ID = "test-run-create-hint";

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

/**
 * 表单本体。
 *
 * 定义在模块顶层（不是 TestRunCreateSheet 内部）这一点是硬要求：写在里面的话
 * 每次重渲染都会得到一个新的组件类型，React 会把整棵子树卸载重建，而这棵子树
 * 里正好有两个受控输入框——打字打到一半焦点就没了。
 *
 * 表单自己是 min-h-0 的弹性列：用例选择器内部还有一层可滚区域
 * （模块树 / 用例表），外层不能跟着一起长高，否则标题栏和分页条会被顶出视口。
 */
function CreateForm({
	controller,
	projectId,
}: {
	controller: CreateRunController;
	projectId: string;
}) {
	return (
		<form
			className="flex min-h-0 flex-1 flex-col gap-4 p-4"
			id={CREATE_FORM_ID}
			onSubmit={controller.handleSubmit}
		>
			<RunFields
				description={controller.draft.description}
				name={controller.draft.name}
				onDescriptionChange={controller.setDescription}
				onNameChange={controller.setName}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-2">
				<p className="font-medium text-sm">选择用例</p>
				<CasePicker
					onChange={controller.setCaseIds}
					projectId={projectId}
					selectedIds={controller.draft.caseIds}
				/>
			</div>
		</form>
	);
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
	const controller = useCreateRunDraft(projectId, onClose);
	const { guard } = controller;

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<CreateHeader
								blocked={controller.blocked}
								hint={controller.hint}
								onCancel={controller.requestClose}
								pending={controller.pending}
							/>
							<Separator />
							<CreateForm controller={controller} projectId={projectId} />
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
