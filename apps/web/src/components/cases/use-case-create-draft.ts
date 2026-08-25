/**
 * 新建抽屉的草稿生命周期：预生成 caseId →（只在被显式指名时）恢复 → 防抖回写 →
 * 放弃 / 保存后清缓存。
 *
 * 这个 hook 挂在**抽屉主体**上（`case-create-body.tsx`），而主体只在抽屉打开时
 * 挂载。于是「开一次抽屉 = 一次草稿会话」就是一次普通的挂载 effect，不需要再去
 * 比对 open 的前后状态——那种比对最容易写出「同一次打开跑两遍」。
 *
 * ⚠️ 关闭抽屉**不清缓存**（用户的明确要求：「关掉的时候，也不要清掉草稿吧」）。
 * 只有两个地方会清：用户点「放弃草稿」，以及保存成功。
 *
 * ⚠️ 挂载时**不再自动恢复**任何草稿。以前是「这个模块有草稿就无条件填进表单」，
 * 用户的原话是「现在新建用例永远是草稿的用例，我草稿的要先放着，建新的反而不行了」：
 * 那个行为把「新建」变成了「继续上一份」，想建全新的一条只能先把草稿删掉。
 * 现在只有 URL 上带着 `?draft=<caseId>`（侧栏清单/抽屉顶部提示里的「继续编辑」）
 * 才恢复那一份，其余情况一律是一张空表单 + 一个全新的 caseId。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type DraftSession,
	freshSession,
	openDraftSession,
} from "@/components/cases/case-create-draft-session";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import { clearCaseDraft } from "@/components/cases/case-draft-storage";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
import {
	type CaseDraftAttachments,
	useCaseDraftAttachments,
} from "@/components/cases/use-case-draft-attachments";
import { useDraftWrite } from "@/components/cases/use-case-draft-write";

/** 模块级常量：空清单要保持同一个引用，否则每次渲染都算「换了一份草稿」。 */
const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

/**
 * 清掉这次会话在缓存里的那条记录。caseId 还没就绪时（挂载后的第一帧）什么都
 * 不做——键按 caseId 算，没有它就指不到任何一条记录，见 `case-draft-storage.ts`。
 */
function clearDraftIfAny(projectId: string, caseId: string | null): void {
	if (caseId !== null) {
		clearCaseDraft(projectId, caseId);
	}
}

export interface CaseCreateDraft {
	attachments: CaseDraftAttachments;
	/** 预生成的用例 id；挂载后的第一帧还没读完缓存，此时为 null。 */
	caseId: string | null;
	/** 用户点「放弃草稿」：清缓存、清空表单、换一个全新的 caseId。 */
	discard: () => void;
	/** 保存成功后调用：清缓存，并且此后不再回写。 */
	forget: () => void;
	/** 指名要恢复的那份草稿已经不在本机了。 */
	missing: boolean;
	restoredAt: number | null;
	setValues: (values: CaseFormValues) => void;
	values: CaseFormValues;
}

/**
 * 会话上那三个对外可见的字段，连同「会话还没就绪」时各自的兜底值。
 *
 * 挑出来单独一个函数，是因为它们其实是同一件事（这次会话是哪一份）的三个投影：
 * 三行 `session?.x ?? y` 摊在 return 里，会把这个 hook 的主线——读缓存 → 防抖
 * 回写 → 放弃/保存——淹在兜底表达式中间。
 */
function sessionFields(
	session: DraftSession | null
): Pick<CaseCreateDraft, "caseId" | "missing" | "restoredAt"> {
	return {
		caseId: session?.caseId ?? null,
		missing: session?.missing ?? false,
		restoredAt: session?.restoredAt ?? null,
	};
}

export function useCaseCreateDraft(
	projectId: string,
	moduleId: string,
	/** URL 上 `?draft=` 指名要恢复的草稿 id；不带就是一张全新的空表单。 */
	draftId: string | undefined
): CaseCreateDraft {
	const [session, setSession] = useState<DraftSession | null>(null);
	const [values, setValues] = useState<CaseFormValues>(emptyCaseFormValues);
	const [saved, setSaved] = useState(false);
	const baseline = useMemo(() => emptyCaseFormValues(), []);

	/**
	 * ⚠️ 必须挂载之后才读 localStorage：`/projects/$projectId` 是 SSR 的，
	 * 首帧读存储会让服务端 HTML 与客户端首次渲染不一致，触发 hydration 报错
	 * （同 `workspace/use-module-expansion.ts` 文件头那条）。
	 *
	 * 这个 effect 只在 draftId 变化时重跑，而 draftId 变化必然伴随抽屉主体的
	 * 重新挂载（外壳的 key 绑了它，见 `case-create-sheet.tsx`），所以它实际上
	 * 就是「每次打开抽屉跑一次」。
	 */
	useEffect(() => {
		const opened = openDraftSession(projectId, draftId);
		setSession(opened.session);
		// 只有真恢复出一份草稿时才动表单，另外两条路必须让空表单保持原样，
		// 理由见 `case-create-draft-session.ts` 里 OpenedDraft 那段。
		if (opened.values !== null) {
			setValues(opened.values);
		}
	}, [draftId, projectId]);

	const currentCaseId = session?.caseId ?? null;

	const attachments = useCaseDraftAttachments({
		caseId: currentCaseId,
		projectId,
		restored: session?.restored ?? NO_ATTACHMENTS,
	});

	useDraftWrite({
		baseline,
		moduleId,
		pending: attachments.pending,
		projectId,
		saved,
		session,
		values,
	});

	const discard = useCallback(() => {
		clearDraftIfAny(projectId, currentCaseId);
		setValues(emptyCaseFormValues());
		// 换一个全新的 caseId：旧 id 的那批图已经不再被任何正文引用，
		// 继续沿用只会让它们混进下一次保存的待登记清单里。
		setSession(freshSession());
	}, [currentCaseId, projectId]);

	const forget = useCallback(() => {
		setSaved(true);
		clearDraftIfAny(projectId, currentCaseId);
	}, [currentCaseId, projectId]);

	return {
		attachments,
		discard,
		forget,
		setValues,
		values,
		...sessionFields(session),
	};
}
