/**
 * 「新建测试任务」抽屉的全部状态与写操作。
 *
 * 为什么是整体抽成一个自定义 hook，而不是像同目录别的文件那样拆几个子组件：
 * 这里的 hook **一个都搬不进子组件**。草稿是两个受控输入框的唯一来源，搬下去
 * 之后每次按键都会让那棵子树换一次实例，输入框当场丢焦点（名称框尤其明显，
 * 打两个字就得重新点一次）；而未保存守卫又必须在抽屉关闭**之前**就能回答
 * 「有没有改动」，它比抽屉内容活得久，更不能跟着内容一起卸载。
 *
 * 整体搬出来、在原处按原顺序调用，React 看到的 hook 序列与拆之前逐个相同，
 * 组件实例身份也没变——纯粹是把行数挪进了另一个文件。
 */
import { type FormEvent, useCallback, useState } from "react";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { useCreateTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

const EMPTY_DRAFT: TestRunDraft = { caseIds: [], description: "", name: "" };

/** 按钮点不动时的原因文案；提交中不显示。 */
function blockedHint(draft: TestRunDraft, pending: boolean): string | null {
	if (pending) {
		return null;
	}
	if (draft.name.trim() === "") {
		return "请先填写测试任务名称。";
	}
	if (draft.caseIds.length === 0) {
		return "请至少勾选一条用例。";
	}
	return null;
}

interface CreateSubmitInput {
	blocked: boolean;
	create: ReturnType<typeof useCreateTestRun>;
	draft: TestRunDraft;
	projectId: string;
}

/**
 * 提交处理器。单独拎出来只为行数，依赖数组与拆之前逐字相同
 * （`[blocked, create, draft, projectId]`），四个名字也原样成了入参。
 *
 * `blocked` 在这里再判一次不是多余：按钮用的是 aria-disabled 而不是 disabled
 * （灰按钮读屏聚不上去，用户听不到旁边那句「为什么点不动」），所以这个表单
 * 真的能被回车提交出来，拦截只能落在这里。
 */
function useCreateSubmit({
	blocked,
	create,
	draft,
	projectId,
}: CreateSubmitInput) {
	return useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate({
				caseIds: draft.caseIds,
				description: draft.description.trim() === "" ? null : draft.description,
				name: draft.name.trim(),
				projectId,
			});
		},
		[blocked, create, draft, projectId]
	);
}

export function useCreateRunDraft(projectId: string, onClose: () => void) {
	/*
	 * 草稿留在抽屉组件里（而不是随内容一起卸载）：守卫要在关闭**之前**
	 * 知道有没有改动。内容仍然按 open 卸载，关掉再打开不会带上一次的残留。
	 */
	const [draft, setDraft] = useState<TestRunDraft>(EMPTY_DRAFT);

	const close = useCallback(() => {
		setDraft(EMPTY_DRAFT);
		onClose();
	}, [onClose]);
	const create = useCreateTestRun(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(draft, EMPTY_DRAFT),
		close
	);
	/** 标题栏的「取消」= 关抽屉，与 Esc / 点外面 / 右上角 × 同一个后果。 */
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const setName = useCallback(
		(name: string) => setDraft((prev) => ({ ...prev, name })),
		[]
	);
	const setDescription = useCallback(
		(description: string) => setDraft((prev) => ({ ...prev, description })),
		[]
	);
	const setCaseIds = useCallback(
		(caseIds: string[]) => setDraft((prev) => ({ ...prev, caseIds })),
		[]
	);

	// 后端也会以 `empty-cases` 拒绝（BAD_REQUEST），但前端这一道不能省：
	// 让人填完整个表单、点了创建、再被弹一条红字打回来，是最难受的一种失败。
	const blocked =
		draft.name.trim() === "" || draft.caseIds.length === 0 || create.isPending;

	const handleSubmit = useCreateSubmit({ blocked, create, draft, projectId });

	return {
		blocked,
		draft,
		guard,
		handleSubmit,
		hint: blockedHint(draft, create.isPending),
		pending: create.isPending,
		requestClose,
		setCaseIds,
		setDescription,
		setName,
	};
}

/** 抽屉主体拿它当 prop 的类型，免得把上面这一坨形状再抄一遍。 */
export type CreateRunController = ReturnType<typeof useCreateRunDraft>;
