/**
 * 编辑测试任务：只改名称与说明，**刻意保持窄对话框**。
 *
 * 新建走的是 1280px 的大抽屉（test-run-create-sheet.tsx），因为那里要放下
 * 一整棵模块树加一页用例表；这里只有两个文本框，给它开同样的抽屉是把
 * 「同一件事用同一套壳」误读成「所有弹层都得长一样」。
 *
 * **编辑不给改用例**——那是详情页「追加 / 移出用例」的事（W6），在这里再放
 * 一份会出现两个入口改同一份数据，且这一份还看不到每条用例已经打了什么结论。
 */
import type { TestRun } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { type FormEvent, useCallback, useState } from "react";

import { RunFields } from "@/components/test-runs/test-run-fields";
import { useUpdateTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface EditFormProps {
	onClose: () => void;
	run: TestRun;
}

function EditForm({ onClose, run }: EditFormProps) {
	const [name, setName] = useState(run.name);
	const [description, setDescription] = useState(run.description ?? "");
	const update = useUpdateTestRun(onClose);
	const blocked = name.trim() === "" || update.isPending;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			update.mutate({
				description: description.trim() === "" ? null : description,
				name: name.trim(),
				runId: run.id,
			});
		},
		[blocked, description, name, run.id, update]
	);

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<RunFields
				description={description}
				name={name}
				onDescriptionChange={setDescription}
				onNameChange={setName}
			/>
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button aria-disabled={blocked} type="submit">
					{update.isPending ? "保存中…" : "保存"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface TestRunEditDialogProps {
	onClose: () => void;
	open: boolean;
	/** null 时不渲染内容：列表里那一行可能已经被别人删掉了。 */
	run: TestRun | null;
}

export function TestRunEditDialog({
	onClose,
	open,
	run,
}: TestRunEditDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>编辑测试任务</DialogTitle>
					<DialogDescription>
						只能修改名称与说明；增删用例请到测试任务详情页。
					</DialogDescription>
				</DialogHeader>
				{/*
				 * 关闭时整个卸载（open 为 false 就不渲染），再靠 key 区分不同的测试任务：
				 * 表单状态是 useState，留在 DOM 里会让下一次打开带着上一次的残留。
				 */}
				{open && run ? (
					<EditForm key={run.id} onClose={onClose} run={run} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
