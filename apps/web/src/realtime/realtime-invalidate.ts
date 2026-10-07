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

const TARGET_KEYS: Record<InvalidateTarget, () => QueryKey> = {
	caseAttachments: () => orpc.caseAttachments.key(),
	cases: () => orpc.cases.key(),
	mindmap: () => orpc.mindmap.key(),
	modules: () => orpc.modules.key(),
	projects: () => orpc.projects.key(),
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

export function useInvalidateAll(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		invalidateTargets(queryClient, ALL_INVALIDATE_TARGETS);
	}, [queryClient]);
}

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
