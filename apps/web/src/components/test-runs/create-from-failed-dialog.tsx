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
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { useCreateTestRunFromFailed } from "@/components/test-runs/use-test-run-list-mutations";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
} from "@/components/wide-sheet-shell";

const NAME_FIELD_ID = "retest-run-name";
const DESCRIPTION_FIELD_ID = "retest-run-description";

/**
 * 预填一个名字：这个动作十有八九就叫「XX 重测」，让用户改而不是从零打字。
 * 同一份值也当基线用——一打开就带着内容，拿空表单去比会让「什么都没动就关掉」
 * 每次都弹一次确认。
 */
function initialDraft(sourceName: string): TestRunDraft {
	return { caseIds: [], description: "", name: `${sourceName} 重测` };
}

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
	const [draft, setDraft] = useState<TestRunDraft>(() =>
		initialDraft(sourceName)
	);

	const close = useCallback(() => {
		setDraft(initialDraft(sourceName));
		onClose();
	}, [onClose, sourceName]);
	const create = useCreateTestRunFromFailed(close);
	/*
	 * 二次确认的基线是**预填后的**草稿，不是空表单：名字一打开就有值，
	 * 拿空表单去比会把「什么都没动」判成脏，每次关闭都要多点一次确认。
	 * 换壳不影响这件事——点遮罩、按 Esc、点关闭按钮在 Dialog 上同样走
	 * onOpenChange(false)，守卫接的就是它。
	 */
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(draft, initialDraft(sourceName)),
		close
	);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const handleName = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			setDraft((prev) => ({ ...prev, name: event.target.value })),
		[]
	);
	const handleDescription = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			setDraft((prev) => ({ ...prev, description: event.target.value })),
		[]
	);

	const blocked = draft.name.trim() === "" || create.isPending;
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate({
				description: draft.description.trim() === "" ? null : draft.description,
				name: draft.name.trim(),
				sourceRunId,
			});
		},
		[blocked, create, draft, sourceRunId]
	);

	return (
		<>
			<Dialog onOpenChange={guard.handleOpenChange} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>从失败用例创建重测任务</DialogTitle>
						<DialogDescription>
							只复制失败的用例，结论全部重置为未测。
						</DialogDescription>
					</DialogHeader>
					{open ? (
						<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
							<p className="text-muted-foreground text-sm">
								将把「{sourceName}」中
								<span className="font-medium text-foreground tabular-nums">
									{" "}
									{failedCount}{" "}
								</span>
								条失败的用例复制到新的测试任务，源任务本身不会有任何改动。
							</p>
							<div className="flex flex-col gap-2">
								<Label htmlFor={NAME_FIELD_ID}>新测试任务名称</Label>
								<Input
									id={NAME_FIELD_ID}
									onChange={handleName}
									required={true}
									value={draft.name}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor={DESCRIPTION_FIELD_ID}>说明</Label>
								<Textarea
									id={DESCRIPTION_FIELD_ID}
									onChange={handleDescription}
									placeholder="可选"
									value={draft.description}
								/>
							</div>
							<DialogFooter>
								{/*
								 * 取消走 requestClose 而不是 onClose：它和点遮罩、按 Esc
								 * 是同一件事，都得先过一遍未保存改动的守卫。
								 */}
								<Button onClick={requestClose} type="button" variant="outline">
									取消
								</Button>
								<Button aria-disabled={blocked} type="submit">
									{create.isPending ? "创建中…" : "创建重测任务"}
								</Button>
							</DialogFooter>
						</form>
					) : null}
				</DialogContent>
			</Dialog>
			<UnsavedChangesDialog
				description="重测任务的名称或说明还没保存，关掉就要重填一遍。"
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
			/>
		</>
	);
}
