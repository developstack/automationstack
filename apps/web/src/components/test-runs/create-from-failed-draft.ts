/**
 * 「从失败用例创建重测任务」这张表单的状态与动作
 * （从 `create-from-failed-dialog.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 整段前奏原样抽成 hook、在组件里按原顺序调用，而不是跟着 `<form>` 一起搬进
 * 子组件：对话框的内容是按 `open` 挂载卸载的，草稿跟着搬过去就会随内容一起
 * 消失——而未保存守卫恰恰要在关闭**之前**读到它。留在 hook 里，持有草稿的
 * 仍然是 `CreateFromFailedDialog` 这一个实例。
 *
 * 拆成两个 hook 的切口落在守卫上：前一半是「这张表单怎么关」，后一半是
 * 「这张表单怎么填、怎么提交」。切在别处就得把 useState / useMutation 的调用
 * 顺序打乱，那是会改执行时机的。
 */
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { useCreateTestRunFromFailed } from "@/components/test-runs/use-test-run-list-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

/**
 * 预填一个名字：这个动作十有八九就叫「XX 重测」，让用户改而不是从零打字。
 * 同一份值也当基线用——一打开就带着内容，拿空表单去比会让「什么都没动就关掉」
 * 每次都弹一次确认。
 */
function initialDraft(sourceName: string): TestRunDraft {
	return { caseIds: [], description: "", name: `${sourceName} 重测` };
}

interface RetestDraftInput {
	onClose: () => void;
	sourceName: string;
}

export function useRetestDraft({ onClose, sourceName }: RetestDraftInput) {
	const [draft, setDraft] = useState(() => initialDraft(sourceName));

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

	return { create, draft, guard, requestClose, setDraft };
}

/**
 * 用 `ReturnType` 而不是手写一份接口：里面的 `create` 是一整个 mutation 结果，
 * 抄一遍它的类型只会在 orpc 或 react-query 升级时变成一处对不上的旧签名。
 */
export type RetestDraft = ReturnType<typeof useRetestDraft>;

/** `<form>` 那一层要的全部东西。命名按 DOM 事件属性来，子组件直接摊到元素上。 */
export interface RetestFormState {
	blocked: boolean;
	onDescriptionChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	pending: boolean;
}

/** 名称 trim 后当标题；说明留白等于没写，存 null 而不是空串，免得列表里
 * 「有说明但一个字都没有」和「没有说明」两种状态在 UI 上分不开。 */
function retestInput(draft: TestRunDraft, sourceRunId: string) {
	return {
		description: draft.description.trim() === "" ? null : draft.description,
		name: draft.name.trim(),
		sourceRunId,
	};
}

export function useRetestForm(
	retest: RetestDraft,
	sourceRunId: string
): RetestFormState {
	const { create, draft, setDraft } = retest;

	/*
	 * 两个 onChange 的依赖里写着 `setDraft`，但它是 `useState` 的 setter、
	 * 恒等不变，写不写都不会多重建一次回调；写上只是因为它现在是从参数里解构
	 * 出来的，静态检查看不出这份恒等性，空依赖数组会被判成漏依赖。
	 */
	const handleName = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			setDraft((prev) => ({ ...prev, name: event.target.value })),
		[setDraft]
	);
	const handleDescription = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			setDraft((prev) => ({ ...prev, description: event.target.value })),
		[setDraft]
	);

	const blocked = draft.name.trim() === "" || create.isPending;
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate(retestInput(draft, sourceRunId));
		},
		[blocked, create, draft, sourceRunId]
	);

	return {
		blocked,
		onDescriptionChange: handleDescription,
		onNameChange: handleName,
		onSubmit: handleSubmit,
		pending: create.isPending,
	};
}
