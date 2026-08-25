/**
 * 新建抽屉「点创建」那一刻的两件事：把创建结果接回草稿态，以及提交前的两道拦截。
 *
 * 从 `case-create-body.tsx` 拆出来，那边只剩「渲染成什么」。这里的两个 hook 仍然
 * 由主体**分别、按原顺序**调用（先 mutation、后 submit，中间隔着报 dirty 的那条
 * effect）——合成一个 hook 会把那条 effect 挤到后面去，那是在动 hook 的调用顺序。
 */
import { useCallback } from "react";
import { toast } from "sonner";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { formValuesToContent } from "@/components/cases/case-meta";
import {
	hasUnfinishedCaseUploads,
	referencedCaseAttachments,
} from "@/components/cases/case-submit-checks";
import type { CaseDraftAttachments } from "@/components/cases/use-case-draft-attachments";
import { useCreateCase } from "@/components/cases/use-case-mutations";

const UPLOADING_MESSAGE = "还有图片正在上传，等它传完再创建。";

/** 创建用例这一发 mutation 的句柄，主体拿它读 `isPending`、提交时调 `mutate`。 */
export type CaseCreateMutation = ReturnType<typeof useCreateCase>;

export interface CaseCreateMutationInput {
	/** 草稿态的「此后不再回写」开关，见 `use-case-create-draft.ts`。 */
	forget: () => void;
	/** 抽屉自己关掉。 */
	onClose: () => void;
	onCreated: (caseId: string) => void;
}

/** 创建成功 / 撞上「已经建过了」两条出路，都要先把草稿缓存了结掉。 */
export function useCaseCreateMutation(
	input: CaseCreateMutationInput
): CaseCreateMutation {
	const { forget, onClose, onCreated } = input;

	const handleCreated = useCallback(
		(newCaseId: string) => {
			forget();
			onCreated(newCaseId);
		},
		[forget, onCreated]
	);
	const handleDuplicate = useCallback(() => {
		// 这条用例已经在库里了，草稿再留着只会被反复提交。清掉并把抽屉收起来，
		// 让用户回到列表——那条用例就在列表里。
		forget();
		onClose();
	}, [forget, onClose]);

	return useCreateCase({
		onCreated: handleCreated,
		onDuplicate: handleDuplicate,
	});
}

export interface CaseCreateSubmitInput {
	attachments: CaseDraftAttachments;
	/** 预生成的用例 id；缓存还没读完时为 null，那一刻不该提交。 */
	caseId: string | null;
	create: CaseCreateMutation;
	moduleId: string;
	projectId: string;
	values: CaseFormValues;
}

export function useCaseCreateSubmit(input: CaseCreateSubmitInput): () => void {
	const { attachments, caseId, create, moduleId, projectId, values } = input;

	return useCallback(() => {
		if (caseId === null || values.name.trim() === "") {
			return;
		}
		/**
		 * 第二道防线。按钮在上传期间是禁用的，但表单里任意输入框按回车都会提交，
		 * 那条路绕过按钮。带着 `![](uploading:<token>)` 提交的后果是不可逆的：
		 * 抽屉一关，上传回来时既找不到编辑器也找不到这份表单值，正文里会永久
		 * 留下一处渲染成「图片上传中…」的死引用，还会被冻进 v1 的版本快照。
		 */
		if (hasUnfinishedCaseUploads(values)) {
			toast.error(UPLOADING_MESSAGE);
			return;
		}
		create.mutate({
			...formValuesToContent(values),
			// 只提交正文里**仍然**被引用的那些：贴了图又把那段删掉的，不登记。
			attachments: referencedCaseAttachments(values, attachments.pending),
			id: caseId,
			moduleId,
			projectId,
		});
	}, [attachments.pending, caseId, create, moduleId, projectId, values]);
}
