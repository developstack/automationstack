/**
 * 执行结论里的「说明」：结果页面是一段文字，修改页面是输入框。
 *
 * 草稿抽的是 hook 不是组件，因为「这个框显不显示」的判断要读到 `draft`
 * （见下面 showComment 的第二条逃生口）。真把 state 关进输入框组件，那条判断就
 * 读不到它了；而 state 一旦跟着子组件走，输入过程中的重渲染还会换掉 textarea
 * 的实例身份，打字打到一半丢焦点。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import {
	commentFieldText,
	needsVerdictDetails,
} from "@/components/test-runs/test-run-meta";

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
	result: TestRunCaseResult;
	/** 每条用例一个 key，用来在切换用例时重置说明输入框。 */
	runCaseId: string;
}

function VerdictCommentField({
	draft,
	onBlur,
	onChange,
	result,
	runCaseId,
}: VerdictCommentFieldProps) {
	const commentText = commentFieldText(result);

	return (
		<div className="flex flex-col gap-1.5">
			<label className={RUN_SECTION_TEXT} htmlFor="run-comment">
				{commentText.label}
			</label>
			<Textarea
				id="run-comment"
				key={runCaseId}
				onBlur={onBlur}
				onChange={onChange}
				placeholder={commentText.placeholder}
				rows={3}
				value={draft}
			/>
		</div>
	);
}

/**
 * 结果页面上的说明：只读的一段文字，空就整块不渲染。
 *
 * 用 `<p>` 而不是只读 textarea：这段字在已提交的测试任务里仍然要能被选中复制，
 * 而 disabled 的 textarea 连读屏都会跳过。
 *
 * 上面那行小标题取的是与输入框同一个 `commentFieldText().label`，所以结果页面
 * 上看到的仍然是「失败原因」「阻塞原因」这些准确的词，而不是一个笼统的「说明」
 * ——尤其是判过失败又改判通过那一档，标题会讲清这段字是上次留下的。
 */
function VerdictCommentText({
	comment,
	result,
}: {
	comment: string | null;
	result: TestRunCaseResult;
}) {
	if (comment === null || comment.trim() === "") {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			<p className={RUN_SECTION_TEXT}>{commentFieldText(result).label}</p>
			{/*
			 * whitespace-pre-wrap：说明里常是分行写的复现步骤，压成一段就读不成路径了。
			 *
			 * 这一段**刻意不套** `RUN_SECTION_TEXT`：执行结论面板里其余文字都统一成了
			 * 次要灰（用户要的「字号与颜色统一」），但那条口径管的是平台自己说的话
			 * ——标签、提示、元信息。这里是用户亲手写下的失败现象与复现路径，是内容，
			 * 把它一起压成灰色是实打实的可读性回退。字号仍与面板同为 text-sm。
			 */}
			<p className="whitespace-pre-wrap text-sm">{comment}</p>
		</div>
	);
}

export interface VerdictCommentProps {
	comment: string | null;
	/**
	 * 给不给输入框。= 改态 **且** 非分步形态：分步形态下每一步有自己的说明框，
	 * 用例级的这一段只可能是分步判定上线前留下的老数据，再给一个编辑器
	 * 就是同一屏里两套说明，谁也说不清保存时哪一份算数。
	 */
	editable: boolean;
	/** 说明失焦时保存；不改结论。 */
	onCommentSave: (comment: string | null) => void;
	result: TestRunCaseResult;
	/** 每条用例一个 key，用来在切换用例时重置说明输入框。 */
	runCaseId: string;
}

/**
 * 说明是**受控 + 本地草稿**：输入时不打请求（每敲一个字发一次会把变更历史刷成
 * 噪音），失焦或切用例时才保存。切用例时用 runCaseId 做 effect 依赖把草稿重置回
 * 服务端值，否则上一条的说明会跟着跑到下一条上。
 */
export function VerdictComment({
	comment,
	editable,
	onCommentSave,
	result,
	runCaseId,
}: VerdictCommentProps) {
	const { draft, handleBlur, handleChange } = useCommentDraft({
		comment,
		onCommentSave,
	});

	if (!editable) {
		return <VerdictCommentText comment={comment} result={result} />;
	}

	/**
	 * 说明框只在**失败 / 阻塞**下出现（`needsVerdictDetails`），外加两条逃生口：
	 *
	 * - `comment` 非空：判过失败又改判通过时那段文字还在库里（后端只有回退成
	 *   `untested` 才清），藏起来等于让人以为丢了；
	 * - `draft` 非空：**还没失焦保存**的输入。点结论按钮时浏览器先把 textarea
	 *   blur 掉再派发 click（base-ui 的 Button 没有在 mousedown/pointerdown 上
	 *   preventDefault，焦点确实会移走），所以 `handleBlur` 一定先跑完；这一条
	 *   是不依赖那个顺序的兜底——输入框绝不会带着没存的字被规则卸载掉。
	 */
	const showComment =
		needsVerdictDetails(result) || (comment ?? "") !== "" || draft !== "";
	if (!showComment) {
		return null;
	}

	return (
		<VerdictCommentField
			draft={draft}
			onBlur={handleBlur}
			onChange={handleChange}
			result={result}
			runCaseId={runCaseId}
		/>
	);
}
