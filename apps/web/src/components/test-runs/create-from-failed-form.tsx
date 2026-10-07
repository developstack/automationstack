import { Button } from "@automationstack/ui/components/button";
import { DialogFooter } from "@automationstack/ui/components/dialog";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";

import type { RetestFormState } from "@/components/test-runs/create-from-failed-draft";
import type { TestRunDraft } from "@/components/test-runs/test-run-draft";

const NAME_FIELD_ID = "retest-run-name";
const DESCRIPTION_FIELD_ID = "retest-run-description";

interface CreateFromFailedFormProps {
	draft: TestRunDraft;
	failedCount: number;
	form: RetestFormState;
	onCancel: () => void;
	sourceName: string;
}

export function CreateFromFailedForm({
	draft,
	failedCount,
	form,
	onCancel,
	sourceName,
}: CreateFromFailedFormProps) {
	return (
		<form className="flex flex-col gap-4" onSubmit={form.onSubmit}>
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
					onChange={form.onNameChange}
					required={true}
					value={draft.name}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor={DESCRIPTION_FIELD_ID}>说明</Label>
				<Textarea
					id={DESCRIPTION_FIELD_ID}
					onChange={form.onDescriptionChange}
					placeholder="可选"
					value={draft.description}
				/>
			</div>
			<DialogFooter>
				<Button onClick={onCancel} type="button" variant="outline">
					取消
				</Button>
				<Button aria-disabled={form.blocked} type="submit">
					{form.pending ? "创建中…" : "创建重测任务"}
				</Button>
			</DialogFooter>
		</form>
	);
}
