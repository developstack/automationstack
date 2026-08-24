/**
 * 侧栏「未完成草稿」入口的数据源：这个项目留在本机 localStorage 里的草稿清单。
 *
 * ⚠️ 首帧一定是空清单，挂载之后才去读 —— `/projects/$projectId` 会 SSR，
 * 首帧读存储会让服务端 HTML 与客户端首次渲染对不上，触发 hydration 报错
 * （同 `use-module-expansion.ts` 文件头那条）。「没有草稿就整行不渲染」这条规则
 * 因此在服务端与客户端首帧上一致地判为「不渲染」，不会先闪一行再消失。
 *
 * 仍然刻意不上定时轮询——但理由变了。原先这里写的是「数量只在每次打开入口时
 * 重读一遍（`refresh`）就够准了」，**那是错的**：数量为 0 时侧栏整行不渲染
 * （`case-drafts-link.tsx`），于是「从 0 变 1」的那一刻用户压根没有入口可点，
 * 也就永远触发不了那次重读，只能刷新整页——这正是用户报的「有草稿不会自动更新
 * 页面」。现在改成两条订阅把变化全接住：`subscribeCaseDrafts` 管本标签页自己的
 * 写入（`storage` 事件在写入它的那个标签页里从不触发），`storage` 事件管别的
 * 标签页。变更的发起方自己会说一声，轮询就只剩下白烧主线程这一个作用了。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CaseDraft } from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	subscribeCaseDrafts,
} from "@/components/cases/case-draft-storage";

/** 模块级常量：空清单要保持同一个引用，否则每次渲染都算「清单变了」。 */
const NO_DRAFTS: readonly CaseDraft[] = [];

export interface LocalCaseDrafts {
	/** 同一个模块可以有多份，靠 `caseId` 区分（存储键就是按它分的）。 */
	items: readonly CaseDraft[];
	/**
	 * 强制重读一遍 localStorage。正常的增删改已经由订阅接住了，这个口子留给
	 * 绕开存储模块的改动（devtools 手改、别的脚本写的键）——那些既不发通知，
	 * 也不会在本标签页触发 `storage`。
	 */
	refresh: () => void;
	/** 按草稿自己的 caseId 删掉一份；清单靠存储模块的通知跟着更新。 */
	remove: (caseId: string) => void;
}

export function useLocalCaseDrafts(projectId: string): LocalCaseDrafts {
	const [items, setItems] = useState<readonly CaseDraft[]>(NO_DRAFTS);

	const refresh = useCallback(() => {
		setItems(listCaseDrafts(projectId));
	}, [projectId]);

	/*
	 * 订阅与首读放在同一个 effect 里，且**先订阅再读**：反过来的话，两者之间
	 * 落下的那次写入既不在首读的结果里、也还没有订阅者能收到，就永远漏掉了。
	 *
	 * 两条来源分工：
	 * - `subscribeCaseDrafts` —— 本标签页内的写入（抽屉里 500ms 防抖的回写、
	 *   关抽屉时的 flush、清单里的删除）。这条是这次修的主角。
	 * - `storage` —— 用户在**别的**标签页里写完/放弃了草稿。不按 key 过滤：
	 *   回调只是重读一遍这个项目的几十个键，比维护一份「哪些键算数」的判断
	 *   更不容易和存储键的格式走散。
	 */
	useEffect(() => {
		const unsubscribe = subscribeCaseDrafts(refresh);
		window.addEventListener("storage", refresh);
		refresh();
		return () => {
			unsubscribe();
			window.removeEventListener("storage", refresh);
		};
	}, [refresh]);

	// 删完不用自己 refresh：`clearCaseDraft` 会发通知，上面那条订阅收得到——
	// 而且这样**所有**打开着的清单（侧栏弹窗、抽屉顶部的提示条）会一起更新，
	// 不只是发起删除的那一个。
	const remove = useCallback(
		(caseId: string) => clearCaseDraft(projectId, caseId),
		[projectId]
	);

	return useMemo(() => ({ items, refresh, remove }), [items, refresh, remove]);
}
