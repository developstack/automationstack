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
				{open && run ? (
					<EditForm key={run.id} onClose={onClose} run={run} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
