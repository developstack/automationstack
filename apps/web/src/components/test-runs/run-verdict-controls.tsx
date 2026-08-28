/**
 * 结论选择（通过 / 失败 / 阻塞 / 跳过）+ 说明。
 *
 * 这里只剩「显不显示说明框」这一个判断和两块子 UI 的编排：按钮组在
 * `run-verdict-picker.tsx`（连同为什么不用原生 radio 的理由），说明框与
 * 它的本地草稿在 `run-verdict-comment.tsx`。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import {
	useCommentDraft,
	VerdictCommentField,
} from "@/components/test-runs/run-verdict-comment";
import { VerdictPicker } from "@/components/test-runs/run-verdict-picker";
import { needsVerdictDetails } from "@/components/test-runs/test-run-meta";

export interface VerdictControlsProps {
	comment: string | null;
	disabled: boolean;
	/** 说明失焦时保存；不改结论。 */
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	result: TestRunCaseResult;
	/** 每条用例一个 key，用来在切换用例时重置说明输入框。 */
	runCaseId: string;
}

/**
 * 说明是**受控 + 本地草稿**：输入时不打请求（每敲一个字发一次会把
 * 变更历史刷成噪音），失焦或切用例时才保存。切用例时用 runCaseId 做 effect
 * 依赖把草稿重置回服务端值，否则上一条的说明会跟着跑到下一条上。
 */
export function VerdictControls({
	comment,
	disabled,
	onCommentSave,
	onPick,
	result,
	runCaseId,
}: VerdictControlsProps) {
	const { draft, handleBlur, handleChange } = useCommentDraft({
		comment,
		onCommentSave,
	});

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

	return (
		<div className="flex flex-col gap-3">
			<VerdictPicker disabled={disabled} onPick={onPick} result={result} />
			{showComment ? (
				<VerdictCommentField
					draft={draft}
					onBlur={handleBlur}
					onChange={handleChange}
					readOnly={disabled}
					result={result}
					runCaseId={runCaseId}
				/>
			) : null}
		</div>
	);
}
