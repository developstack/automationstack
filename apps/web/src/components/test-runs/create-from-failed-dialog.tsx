/**
 * 「从失败用例创建重测任务」（plan D11）。
 *
 * 这是已提交测试任务唯一的去处：`submitted` 不可逆，要接着测只能另开一个。所以入口
 * 对已提交的测试任务同样开放——它恰恰是那些任务最常被点的一项，不能跟着删除一起灰掉。
 *
 * 只收名称与说明，不给挑用例：要带走的就是源任务里所有 `failed` 的那些，
 * 由后端在一个事务里取（前端这边的 `counts.failed` 只是个显示值，
 * 可能已经被别人改过了）。
 *
 * **壳是窄对话框，不是大抽屉。** 曾经按「创建出来的同样是一个测试任务，
 * 入口该有同一种手感」把它改成过 1280px 满高抽屉，那条理由不成立：
 * 决定壳的是**这一屏要装什么**。新建测试任务要抽屉，是因为里面有一整棵模块树
 * 加一页用例表（`CasePicker`）；这里没有 CasePicker，只有两个文本框——
 * 字段构成与「编辑测试任务」逐字相同，而编辑分支明确保留了 Dialog。
 * 在一个 1280px 满高的抽屉里放两个输入框，正是那条「按内容定尺寸」的规则
 * 本身在防的形态。
 *
 * 这个文件只剩壳：草稿与提交在 `create-from-failed-draft.ts`，表单本体在
 * `create-from-failed-form.tsx`（见 eslint 的 50 行函数上限）。
 */
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";

import {
	useRetestDraft,
	useRetestForm,
} from "@/components/test-runs/create-from-failed-draft";
import { CreateFromFailedForm } from "@/components/test-runs/create-from-failed-form";
import { UnsavedChangesDialog } from "@/components/wide-sheet-shell";

interface CreateFromFailedDialogProps {
	failedCount: number;
	onClose: () => void;
	open: boolean;
	sourceName: string;
	sourceRunId: string;
}

export function CreateFromFailedDialog({
	failedCount,
	onClose,
	open,
	sourceName,
	sourceRunId,
}: CreateFromFailedDialogProps) {
	/*
	 * 草稿留在这一层（内容仍按 open 卸载）：守卫要在关闭**之前**知道
	 * 用户改没改过预填的名字。
	 */
	const retest = useRetestDraft({ onClose, sourceName });
	const form = useRetestForm(retest, sourceRunId);

	return (
		<>
			<Dialog onOpenChange={retest.guard.handleOpenChange} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>从失败用例创建重测任务</DialogTitle>
						<DialogDescription>
							只复制失败的用例，结论全部重置为未测。
						</DialogDescription>
					</DialogHeader>
					{open ? (
						<CreateFromFailedForm
							draft={retest.draft}
							failedCount={failedCount}
							form={form}
							onCancel={retest.requestClose}
							sourceName={sourceName}
						/>
					) : null}
				</DialogContent>
			</Dialog>
			<UnsavedChangesDialog
				description="重测任务的名称或说明还没保存，关掉就要重填一遍。"
				onCancel={retest.guard.cancelClose}
				onConfirm={retest.guard.confirmClose}
				open={retest.guard.confirming}
			/>
		</>
	);
}
