/**
 * 一次草稿会话的开场：这次打开抽屉，是接着哪一份写，还是从零开始。
 *
 * 从 `use-case-create-draft.ts` 拆出来，是因为这几条分支是**纯逻辑**——给定
 * projectId 与 URL 上的 `?draft=`，答案就定了，不牵涉任何 React 状态。留在那个
 * hook 里只会让「读缓存的三条路」和「防抖回写、放弃、保存后清理」挤在同一个
 * 函数里，谁都读不清。
 *
 * ⚠️ 这里的函数都会碰 localStorage，只能在挂载之后调（`/projects/$projectId`
 * 是 SSR 的，首帧读存储会触发 hydration 不一致），调用处那条 effect 上有完整理由。
 */
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import { readCaseDraft } from "@/components/cases/case-draft-storage";
import type { CaseFormValues } from "@/components/cases/case-meta";

export interface DraftSession {
	caseId: string;
	/**
	 * URL 上指名要恢复的那份草稿**没找到**（多半是在别处/别的标签页删掉了）。
	 * 必须报出去让界面说一句：静默给一张空表单，用户会以为草稿丢了。
	 */
	missing: boolean;
	/** 从缓存恢复出来的对照表；新草稿是空清单。 */
	restored: readonly CaseDraftAttachment[];
	/** 恢复自缓存时是那份草稿的写入时刻；全新草稿为 null。 */
	restoredAt: number | null;
}

/**
 * `restored` 刻意每次都造一个**新数组**而不是复用 `NO_ATTACHMENTS`：
 * 下游按这个引用的变化来重置待登记清单，共用同一个常量会让
 * 「刚贴完图就点放弃草稿」那一次重置不发生，刚放弃掉的图仍然会被登记进库。
 */
export function freshSession(missing = false): DraftSession {
	return {
		caseId: crypto.randomUUID(),
		missing,
		restored: [],
		restoredAt: null,
	};
}

/**
 * 打开一次草稿会话的结果。
 *
 * `values` 分成「有」和 null 两种，而不是一律给一份空表单：全新草稿那条路上
 * 表单本来就是空的，再 setValues 一次等于白挨一次重渲，还会把表单值换成另一个
 * 对象引用——下游按引用判「这份内容是不是同一份」的地方会被平白惊动一次。
 */
interface OpenedDraft {
	session: DraftSession;
	/** null = 别动表单，保持它原样。 */
	values: CaseFormValues | null;
}

/**
 * 三条路，只有中间那条会往表单里填字：
 * - URL 上没带 `?draft=`：全新 caseId + 空表单（这是「新建」的默认语义，
 *   本模块有没有别的草稿一概不管，理由见 `use-case-create-draft.ts` 文件头）。
 * - 带了、也读到了：接着那一份写，caseId 沿用它的。
 * - 带了、但本机已经没有：仍然是全新会话，只是把 `missing` 立起来让界面说一句。
 */
export function openDraftSession(
	projectId: string,
	draftId: string | undefined
): OpenedDraft {
	if (draftId === undefined) {
		return { session: freshSession(), values: null };
	}
	const stored = readCaseDraft(projectId, draftId);
	if (stored === null) {
		return { session: freshSession(true), values: null };
	}
	return {
		session: {
			caseId: stored.caseId,
			missing: false,
			restored: stored.attachments,
			restoredAt: stored.savedAt,
		},
		values: stored.values,
	};
}
