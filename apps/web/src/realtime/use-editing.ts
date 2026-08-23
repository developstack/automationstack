/**
 * 用例级协作 presence（plan §5）：详情抽屉挂载时上报「我在看哪条用例」，
 * 进入编辑态时额外上报「我在改哪条用例」，卸载时两者一起清空。
 *
 * **不加锁** —— 真正的并发冲突由 `cases.update` 的乐观锁（CONFLICT 409）
 * 兜底，这里只是给其他人一个可见的提醒。
 */
import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { useEffect, useMemo } from "react";

import { noopCleanup } from "./noop-cleanup";
import { useRealtime } from "./realtime-context";
import { usePresence } from "./use-presence";

/**
 * 上报本端正在打开的用例。`caseId` 为 null（抽屉未开）时什么都不发。
 *
 * 「看」与「改」拆成两个 effect，而不是一个依赖 isEditing 的 effect：
 * 合成一个的话，点「编辑」会先跑清理把 viewingCaseId 打回 null 再重新置上，
 * 别人的列表里就会看到这个人凭空闪一下消失又出现。
 */
export function useCasePresence(
	caseId: string | null,
	isEditing: boolean
): void {
	const connection = useRealtime()?.connection ?? null;
	useEffect(() => {
		if (!(connection && caseId)) {
			return noopCleanup;
		}
		connection.updatePresence({
			editingCaseId: isEditing ? caseId : null,
			viewingCaseId: caseId,
		});
		return noopCleanup;
	}, [caseId, connection, isEditing]);
	// 只依赖 caseId / connection：切换编辑态时这条不重跑，因此不会误清
	useEffect(() => {
		if (!(connection && caseId)) {
			return noopCleanup;
		}
		return () => {
			connection.updatePresence({ editingCaseId: null, viewingCaseId: null });
		};
	}, [caseId, connection]);
}

/**
 * 协作者的身份，只留画一枚头像用得到的那两个字段。
 *
 * 不直接透传整条 PresenceEntry：这一列问的是「谁」，而 entry 里的 view /
 * page / joinedAt 回答的是别的问题。透传等于把这一列的类型钉死在 WS 协议上，
 * 协议以后加一个字段，所有调用方都得重新判断「这个我该不该管」。
 *
 * 不再带 color：头像换成 blobatar 之后颜色由 name 自己算出来（见
 * realtime/presence-avatar.tsx），presence 协议里那个 color 字段在前端已经
 * 没有渲染方读它了。协议字段本身留着不动——那是跨包的东西。
 *
 * clientId 必须带上：它是头像列表里稳定且唯一的 React key。用 name 会在重名时
 * 撞 key（显示名来自会话，没有唯一约束），用数组下标则会在有人中途离开时让
 * 剩下的头像整体错位——整张脸跟着挪一格，看着像换了个人。
 */
export interface CaseCollaborator {
	clientId: string;
	name: string;
}

/** 某条用例上的其他协作者：正在编辑的人与仅在查看的人分开列。 */
export interface CaseCollaborators {
	editors: CaseCollaborator[];
	viewers: CaseCollaborator[];
}

function collaboratorOf(entry: PresenceEntry): CaseCollaborator {
	return { clientId: entry.clientId, name: entry.name };
}

function bucketFor(
	byCaseId: Map<string, CaseCollaborators>,
	caseId: string
): CaseCollaborators {
	const existing = byCaseId.get(caseId);
	if (existing) {
		return existing;
	}
	const created: CaseCollaborators = { editors: [], viewers: [] };
	byCaseId.set(caseId, created);
	return created;
}

/**
 * caseId → 该用例上的**其他**成员（不含自己）。
 *
 * 排除自己：这一列是给人看「除我以外还有谁在这条上」的，把自己算进去每条
 * 打开过的用例都会挂上自己的名字，真正有意义的那几条反而淹了。
 *
 * 编辑者不再重复计入 viewers：editingCaseId 不为空时 viewingCaseId 必然
 * 指向同一条（见 useCasePresence），照单全收会让同一个人在一行里出现两次。
 */
export function useCollaboratorsByCaseId(): ReadonlyMap<
	string,
	CaseCollaborators
> {
	const entries = usePresence();
	const selfClientId = useRealtime()?.clientId ?? null;
	return useMemo(() => {
		const byCaseId = new Map<string, CaseCollaborators>();
		for (const entry of entries) {
			if (entry.clientId === selfClientId) {
				continue;
			}
			const { editingCaseId, viewingCaseId } = entry;
			if (editingCaseId !== null) {
				bucketFor(byCaseId, editingCaseId).editors.push(collaboratorOf(entry));
			}
			if (viewingCaseId !== null && viewingCaseId !== editingCaseId) {
				bucketFor(byCaseId, viewingCaseId).viewers.push(collaboratorOf(entry));
			}
		}
		return byCaseId;
	}, [entries, selfClientId]);
}

/** 无人协作时的稳定空数组引用（避免每次渲染产生新引用）。 */
const NO_EDITOR_NAMES: string[] = [];

/**
 * 正在编辑指定用例的其他成员用户名列表（详情面板提示条用）。
 *
 * 提示条只念名字，不画头像，所以从 CaseCollaborator 里把 name 摘出来即可，
 * 不必让它跟着协作列一起认识 clientId。map 包在 useMemo 里：这条
 * 派生数组每渲染新建一次的话，提示条那边的引用相等判断就永远不成立。
 */
export function useCaseEditors(caseId: string | undefined): string[] {
	const byCaseId = useCollaboratorsByCaseId();
	const editors =
		caseId === undefined ? undefined : byCaseId.get(caseId)?.editors;
	return useMemo(
		() => editors?.map((editor) => editor.name) ?? NO_EDITOR_NAMES,
		[editors]
	);
}
