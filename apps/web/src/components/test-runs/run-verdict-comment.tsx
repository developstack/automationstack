/**
 * 说明输入框，以及它背后的那份本地草稿。
 *
 * 草稿抽的是 hook 不是组件，因为 `VerdictControls` 还要拿 `draft` 决定这个
 * 框显不显示（见那边 showComment 的第二条逃生口）。真把 state 关进这个
 * 子组件，那条判断就读不到它了；而 state 一旦跟着子组件走，输入过程中的
 * 重渲染还会换掉 textarea 的实例身份，打字打到一半丢焦点。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { commentFieldText } from "@/components/test-runs/test-run-meta";

export interface CommentDraftOptions {
	comment: string | null;
	/** 说明失焦时保存；不改结论。 */
	onCommentSave: (comment: string | null) => void;
}

export function useCommentDraft({
	comment,
	onCommentSave,
}: CommentDraftOptions) {
	const [draft, setDraft] = useState(comment ?? "");

	useEffect(() => {
		setDraft(comment ?? "");
		// comment 也进依赖：别人改了同一条的说明时，实时失效会把新值推过来。
	}, [comment]);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
		[]
	);

	const handleBlur = useCallback(() => {
		const next = draft.trim() === "" ? null : draft;
		if (next !== (comment ?? null)) {
			onCommentSave(next);
		}
	}, [comment, draft, onCommentSave]);

	return { draft, handleBlur, handleChange };
}

export interface VerdictCommentFieldProps {
	draft: string;
	onBlur: () => void;
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	/** 已提交的测试任务：只读。 */
	readOnly: boolean;
	result: TestRunCaseResult;
	/** 每条用例一个 key，用来在切换用例时重置说明输入框。 */
	runCaseId: string;
}

export function VerdictCommentField({
	draft,
	onBlur,
	onChange,
	readOnly,
	result,
	runCaseId,
}: VerdictCommentFieldProps) {
	const commentText = commentFieldText(result);

	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-muted-foreground text-xs" htmlFor="run-comment">
				{commentText.label}
			</label>
			<Textarea
				id="run-comment"
				key={runCaseId}
				onBlur={onBlur}
				onChange={onChange}
				placeholder={commentText.placeholder}
				// readOnly 而不是 disabled：已提交的测试任务里这段说明仍然要能被选中复制，
				// 而 disabled 的 textarea 连读屏都会跳过。
				readOnly={readOnly}
				rows={3}
				value={draft}
			/>
		</div>
	);
}
