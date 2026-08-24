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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	CaseDraft,
	CaseDraftAttachment,
} from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	readCaseDraft,
	writeCaseDraft,
} from "@/components/cases/case-draft-storage";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
import {
	type CaseDraftAttachments,
	useCaseDraftAttachments,
} from "@/components/cases/use-case-draft-attachments";

/**
 * 回写的防抖窗口。取 500ms 而不是更短：正文是一个字一个字打出来的，
 * 每次按键都 `JSON.stringify` 整份草稿再写一次 localStorage，
 * 会在长正文上把主线程按秒卡住（localStorage 的写是同步的）。
 */
const DRAFT_WRITE_DEBOUNCE_MS = 500;

/** 模块级常量：空清单要保持同一个引用，否则每次渲染都算「换了一份草稿」。 */
const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

/** 这一刻该对 localStorage 做的事。 */
type DraftWrite =
	| { draft: Omit<CaseDraft, "savedAt">; kind: "write" }
	/**
	 * 表单被清空了：主动删掉那条记录，别留一份「恢复出来什么都没有」的草稿。
	 * 带上 caseId 是因为键按它算——键改成 `{projectId}.{caseId}` 之后，
	 * 光有 projectId 已经指不到任何一条记录了。
	 */
	| { caseId: string; kind: "clear" }
	/** caseId 还没就绪，或已经保存成功——这条路上不该再碰存储。 */
	| { kind: "idle" };

/**
 * `{ kind: "idle" }` 的指纹。防抖 effect 只以指纹为输入（理由见 `useDraftPersist`），
 * 于是「要不要排计时器」也从指纹上读，而不是再去看一眼 `write` 那个每渲染都新的对象。
 * 万一将来 idle 变体多了字段、这个常量对不上了，后果也只是白排一个计时器——
 * `flush` 自己对 idle 是空操作。
 */
const IDLE_FINGERPRINT = JSON.stringify({ kind: "idle" });

/**
 * 防抖回写 + **卸载前 flush**。
 *
 * flush 不是锦上添花：用户打完最后一个字就按 Esc 关抽屉，是个远比 500ms 短的
 * 动作。没有它，那句话就正好落在防抖窗口里被 clearTimeout 吃掉——
 * 而这恰恰是整个草稿缓存要救的场景。
 */
function useDraftPersist(write: DraftWrite, projectId: string): void {
	// 指纹用来当 effect 的依赖：`write` 每次渲染都是新对象，直接当依赖会让
	// 防抖计时器在每一次无关重渲时重置，长时间打字反而一次都写不进去。
	const fingerprint = JSON.stringify(write);
	// 卸载时的 flush 读不到 state 的最新值，只能靠 ref 转发。
	const latest = useRef({ projectId, write });
	latest.current = { projectId, write };

	const flush = useCallback(() => {
		const { projectId: latestProjectId, write: latestWrite } = latest.current;
		if (latestWrite.kind === "write") {
			writeCaseDraft(latestProjectId, latestWrite.draft);
		} else if (latestWrite.kind === "clear") {
			clearCaseDraft(latestProjectId, latestWrite.caseId);
		}
	}, []);

	useEffect(() => {
		if (fingerprint === IDLE_FINGERPRINT) {
			return;
		}
		const timer = window.setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [fingerprint, flush]);

	// 卸载 flush 单独一个 effect（依赖为空），否则内容一变就会连带触发一次。
	useEffect(() => flush, [flush]);
}

interface DraftSession {
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
function freshSession(missing = false): DraftSession {
	return {
		caseId: crypto.randomUUID(),
		missing,
		restored: [],
		restoredAt: null,
	};
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
		if (draftId === undefined) {
			setSession(freshSession());
			return;
		}
		const stored = readCaseDraft(projectId, draftId);
		if (stored === null) {
			setSession(freshSession(true));
			return;
		}
		setSession({
			caseId: stored.caseId,
			missing: false,
			restored: stored.attachments,
			restoredAt: stored.savedAt,
		});
		setValues(stored.values);
	}, [draftId, projectId]);

	const attachments = useCaseDraftAttachments({
		caseId: session?.caseId ?? null,
		projectId,
		restored: session?.restored ?? NO_ATTACHMENTS,
	});

	const write = useMemo<DraftWrite>(() => {
		if (session === null || saved) {
			return { kind: "idle" };
		}
		// 一个字没改、一张图没贴：别占着一条记录。否则用户每开一次新建抽屉
		// 就在侧栏的「未完成草稿」里多攒一条空垃圾。
		if (
			!isCaseFormDirty(values, baseline) &&
			attachments.pending.length === 0
		) {
			return { caseId: session.caseId, kind: "clear" };
		}
		return {
			draft: {
				attachments: [...attachments.pending],
				caseId: session.caseId,
				moduleId,
				values,
			},
			kind: "write",
		};
	}, [attachments.pending, baseline, moduleId, saved, session, values]);

	useDraftPersist(write, projectId);

	const currentCaseId = session?.caseId ?? null;

	const discard = useCallback(() => {
		if (currentCaseId !== null) {
			clearCaseDraft(projectId, currentCaseId);
		}
		setValues(emptyCaseFormValues());
		// 换一个全新的 caseId：旧 id 的那批图已经不再被任何正文引用，
		// 继续沿用只会让它们混进下一次保存的待登记清单里。
		setSession(freshSession());
	}, [currentCaseId, projectId]);

	const forget = useCallback(() => {
		setSaved(true);
		if (currentCaseId !== null) {
			clearCaseDraft(projectId, currentCaseId);
		}
	}, [currentCaseId, projectId]);

	return {
		attachments,
		caseId: currentCaseId,
		discard,
		forget,
		missing: session?.missing ?? false,
		restoredAt: session?.restoredAt ?? null,
		setValues,
		values,
	};
}
