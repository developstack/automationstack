/**
 * 「从失败用例创建重测任务」对话框里的那张表单
 * （从 `create-from-failed-dialog.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 定义在**模块顶层**，不是写成 `CreateFromFailedDialog` 内部的一个函数：
 * 内部定义的组件每次父组件重渲染都是一个新类型，React 会把整棵子树卸载重建。
 * 名称与说明都是受控输入，父组件恰恰是每敲一个字重渲染一次，那样每敲一个字
 * 都要丢一次焦点——正是这张表单最不能出的问题。
 *
 * 这一层不持有任何状态：值和回调全部来自 `create-from-failed-draft.ts` 的
 * hook，草稿留在对话框那一层才活得过内容按 `open` 的挂载卸载。
 */
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
				{/*
				 * 取消走 onCancel（对话框那边接的是 requestClose）而不是直接关：
				 * 它和点遮罩、按 Esc 是同一件事，都得先过一遍未保存改动的守卫。
				 */}
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
