/**
 * 草稿的回写：这一刻该往 localStorage 写什么，以及什么时候真的写下去。
 *
 * 从 `use-case-create-draft.ts` 拆出来，那边只剩「这次会话是哪一份、用户放弃/
 * 保存了没有」。两件事的边界很清楚：那边管**会话**，这里管**落盘**。
 *
 * ⚠️ 关闭抽屉不清缓存、挂载时不自动恢复，这两条口径都在 `use-case-create-draft.ts`
 * 的文件头上，改这里之前先读那一段。
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { DraftSession } from "@/components/cases/case-create-draft-session";
import type {
	CaseDraft,
	CaseDraftAttachment,
} from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	writeCaseDraft,
} from "@/components/cases/case-draft-storage";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import type { CaseFormValues } from "@/components/cases/case-meta";

/**
 * 回写的防抖窗口。取 500ms 而不是更短：正文是一个字一个字打出来的，
 * 每次按键都 `JSON.stringify` 整份草稿再写一次 localStorage，
 * 会在长正文上把主线程按秒卡住（localStorage 的写是同步的）。
 */
const DRAFT_WRITE_DEBOUNCE_MS = 500;

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
		/**
		 * idle 那一路不排计时器，于是也没有计时器要清——但清理函数仍然由**每条
		 * 路径**返回，而不是一条 `return;`、一条返函数。理由不是为了讨好
		 * consistent-return：这个 effect 需不需要清理，答案只取决于「刚才排没排
		 * 上计时器」，那就让计时器本身来回答。写成 `return undefined` 是把这个
		 * 问题藏起来，下次有人在 idle 那条路上加副作用时不会想起还要清。
		 */
		const timer =
			fingerprint === IDLE_FINGERPRINT
				? null
				: window.setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
		return () => {
			if (timer !== null) {
				window.clearTimeout(timer);
			}
		};
	}, [fingerprint, flush]);

	// 卸载 flush 单独一个 effect（依赖为空），否则内容一变就会连带触发一次。
	useEffect(() => flush, [flush]);
}

export interface DraftWriteInput {
	/** 空表单的对照物，用来判「这份草稿值不值得占一条记录」。 */
	baseline: CaseFormValues;
	moduleId: string;
	/** 待登记的附件清单（`attachments.pending`）。 */
	pending: readonly CaseDraftAttachment[];
	projectId: string;
	/** 已经保存成功：此后一律 idle，别再把这份内容写回缓存。 */
	saved: boolean;
	session: DraftSession | null;
	values: CaseFormValues;
}

/**
 * 会话 + 当前表单 → 这一刻该写/该删/什么都不做。
 *
 * 不收 projectId：写去哪个项目是**落盘**那一层的事（键由 `case-draft-storage.ts`
 * 拼），这里只回答「写什么」。多收一个用不上的字段，还会让上面那个 useMemo 平白
 * 多一条依赖。
 */
function nextWrite(input: Omit<DraftWriteInput, "projectId">): DraftWrite {
	const { baseline, moduleId, pending, saved, session, values } = input;
	if (session === null || saved) {
		return { kind: "idle" };
	}
	// 一个字没改、一张图没贴：别占着一条记录。否则用户每开一次新建抽屉
	// 就在侧栏的「未完成草稿」里多攒一条空垃圾。
	if (!isCaseFormDirty(values, baseline) && pending.length === 0) {
		return { caseId: session.caseId, kind: "clear" };
	}
	return {
		draft: {
			attachments: [...pending],
			caseId: session.caseId,
			moduleId,
			values,
		},
		kind: "write",
	};
}

/**
 * 算出该写什么，再防抖写下去。两步合在一个 hook 里调用，是为了让调用方那边
 * 只有一行——它们本来就没有分开被用到的场合。
 */
export function useDraftWrite(input: DraftWriteInput): void {
	const { baseline, moduleId, pending, projectId, saved, session, values } =
		input;
	const write = useMemo<DraftWrite>(
		() => nextWrite({ baseline, moduleId, pending, saved, session, values }),
		[baseline, moduleId, pending, saved, session, values]
	);

	useDraftPersist(write, projectId);
}
