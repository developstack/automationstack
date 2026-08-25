/**
 * 「追加用例」抽屉。
 *
 * 复用新建测试任务那套 `CasePicker`，不另写一份：两处问的是同一个问题
 * （在这个项目里挑用例），各写一份意味着筛选、分页、多选累积的行为迟早分叉。
 * 既然装的是同一个选择器，壳也用同一个（WIDE_SHEET_CONTENT_CLASS）——它原先
 * 是 1024px 的 Dialog，与新建那边一宽一窄，同一件事两种手感。
 *
 * 文件名与导出名跟着壳走（曾经叫 `add-run-cases-dialog` / `AddRunCasesDialog`）：
 * 名字里写着 Dialog、代码里渲染 Sheet，下一个人按文件名找组件会找错，
 * 按导出名判断壳形态会判错。
 *
 * 已经在测试任务里的用例仍会出现在选择器里——后端 `addCases` 对重复项是幂等的
 * （`onConflictDoNothing`），而把它们过滤掉需要在这里再维护一份「已存在集合」，
 * 用户反而会疑惑「我明明记得有这条，怎么找不到了」。
 *
 * 选中集、守卫与提交在 `add-run-cases-draft.ts`（见 eslint 的 50 行函数上限）。
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

import { useAddRunCasesDraft } from "@/components/test-runs/add-run-cases-draft";
import { CasePicker } from "@/components/test-runs/case-picker";
import {
	UnsavedChangesDialog,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

interface AddCasesHeaderProps {
	blocked: boolean;
	onCancel: () => void;
	onSubmit: () => void;
	pending: boolean;
}

function AddCasesHeader({
	blocked,
	onCancel,
	onSubmit,
	pending,
}: AddCasesHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>追加用例</SheetTitle>
			<SheetDescription>
				新加进来的用例结论是「未测」，测试任务会自动退回「测试中」。
			</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					aria-disabled={blocked}
					onClick={blocked ? undefined : onSubmit}
					size="sm"
					type="button"
				>
					{pending ? "追加中…" : "追加"}
				</Button>
			</div>
		</SheetHeader>
	);
}

interface AddRunCasesSheetProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
	runId: string;
}

export function AddRunCasesSheet({
	onClose,
	open,
	projectId,
	runId,
}: AddRunCasesSheetProps) {
	const draft = useAddRunCasesDraft({ onClose, runId });

	return (
		<>
			<Sheet onOpenChange={draft.guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<AddCasesHeader
								blocked={draft.blocked}
								onCancel={draft.requestClose}
								onSubmit={draft.handleSubmit}
								pending={draft.pending}
							/>
							<Separator />
							{/*
							 * min-h-0 的弹性列：选择器内部还有可滚区域（模块树 / 用例表），
							 * 外层不能跟着一起长高，否则标题栏和分页条会被顶出视口。
							 */}
							<div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
								<CasePicker
									onChange={draft.setCaseIds}
									projectId={projectId}
									selectedIds={draft.caseIds}
								/>
							</div>
						</>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				confirmLabel="放弃并关闭"
				description="这个抽屉里勾中的用例还没有追加进去，关掉就要重新挑一遍。"
				onCancel={draft.guard.cancelClose}
				onConfirm={draft.guard.confirmClose}
				open={draft.guard.confirming}
				title="放弃已勾选的用例？"
			/>
		</>
	);
}
