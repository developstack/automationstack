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
import { useCallback, useState } from "react";

import { CasePicker } from "@/components/test-runs/case-picker";
import { isTestRunDraftDirty } from "@/components/test-runs/test-run-draft";
import { useAddRunCases } from "@/components/test-runs/use-test-run-mutations";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

/** 这个抽屉只挑用例，名称与说明恒为空，复用同一份草稿判定。 */
const NO_TEXT_FIELDS = { description: "", name: "" };

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
	/*
	 * 选中集留在抽屉组件里（内容仍按 open 卸载）：守卫要在关闭**之前**知道
	 * 有没有勾过东西，挑了半天的一批用例不能被一次误点抹掉。
	 */
	const [caseIds, setCaseIds] = useState<string[]>([]);

	const close = useCallback(() => {
		setCaseIds([]);
		onClose();
	}, [onClose]);
	const add = useAddRunCases(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(
			{ ...NO_TEXT_FIELDS, caseIds },
			{ ...NO_TEXT_FIELDS, caseIds: [] }
		),
		close
	);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const blocked = caseIds.length === 0 || add.isPending;
	const handleSubmit = useCallback(() => {
		if (!blocked) {
			add.mutate({ caseIds, runId });
		}
	}, [add, blocked, caseIds, runId]);

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<AddCasesHeader
								blocked={blocked}
								onCancel={requestClose}
								onSubmit={handleSubmit}
								pending={add.isPending}
							/>
							<Separator />
							{/*
							 * min-h-0 的弹性列：选择器内部还有可滚区域（模块树 / 用例表），
							 * 外层不能跟着一起长高，否则标题栏和分页条会被顶出视口。
							 */}
							<div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
								<CasePicker
									onChange={setCaseIds}
									projectId={projectId}
									selectedIds={caseIds}
								/>
							</div>
						</>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				confirmLabel="放弃并关闭"
				description="这个抽屉里勾中的用例还没有追加进去，关掉就要重新挑一遍。"
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
				title="放弃已勾选的用例？"
			/>
		</>
	);
}
