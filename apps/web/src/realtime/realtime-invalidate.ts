/**
 * 把 WS 的 `data:invalidate` 事件接到 TanStack Query 缓存上。
 * 映射规则是纯函数（`map-invalidate.ts`），这里只做 React / orpc 适配。
 */
import {
	type QueryClient,
	type QueryKey,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { orpc } from "@/utils/orpc";

import type { RealtimeConnection } from "./connection";
import {
	ALL_INVALIDATE_TARGETS,
	type InvalidateTarget,
	mapInvalidateTargets,
	shouldApplyInvalidate,
} from "./map-invalidate";
import { noopCleanup } from "./noop-cleanup";

/** target → 部分匹配的 query key（`key()` 覆盖该 router 下所有查询）。 */
const TARGET_KEYS: Record<InvalidateTarget, () => QueryKey> = {
	/** 用例贴图住在独立 router，不在 `orpc.cases.key()` 的前缀里（同下 testRunAttachments）。 */
	caseAttachments: () => orpc.caseAttachments.key(),
	cases: () => orpc.cases.key(),
	mindmap: () => orpc.mindmap.key(),
	modules: () => orpc.modules.key(),
	projects: () => orpc.projects.key(),
	/**
	 * 附件列表是独立 router，不在 `orpc.testRuns.key()` 的前缀里；
	 * 后端把附件的失效事件并进了 `entity: "testRun"`（plan §6.4），
	 * 因此这两个缓存根都得由 testRun 事件带着刷。
	 */
	testRunAttachments: () => orpc.testRunAttachments.key(),
	testRuns: () => orpc.testRuns.key(),
};

function invalidateTargets(
	queryClient: QueryClient,
	targets: readonly InvalidateTarget[]
): void {
	for (const target of targets) {
		queryClient.invalidateQueries({ queryKey: TARGET_KEYS[target]() });
	}
}

/** 重连成功后的全量补漏刷新。 */
export function useInvalidateAll(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		invalidateTargets(queryClient, ALL_INVALIDATE_TARGETS);
	}, [queryClient]);
}

/** 订阅 `data:invalidate`，按 entity 刷新对应缓存根；自己触发的事件跳过。 */
export function useRealtimeInvalidate(
	connection: RealtimeConnection | null,
	selfClientId: string | null
): void {
	const queryClient = useQueryClient();
	useEffect(() => {
		if (connection === null) {
			return noopCleanup;
		}
		return connection.subscribe((message) => {
			if (
				message.type !== "data:invalidate" ||
				!shouldApplyInvalidate(message, selfClientId)
			) {
				return;
			}
			invalidateTargets(queryClient, mapInvalidateTargets(message));
		});
	}, [connection, queryClient, selfClientId]);
}
