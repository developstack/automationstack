/**
 * 刷新恢复：sessionStorage 里若还留着上一轮的 sessionId，
 * 就用 `ai.getSession` 把提案（含 accepted/rejected 状态）取回评审阶段。
 * 会话已不存在时静默清掉本地记录，不打扰用户。
 */
import { type Dispatch, useCallback } from "react";

import type { AiGenerationAction } from "@/components/ai/ai-generation-state";
import {
	clearStoredSessionId,
	readStoredSessionId,
} from "@/components/ai/ai-session-storage";
import { client } from "@/utils/orpc";

export function useAiSessionRestore(
	projectId: string,
	dispatch: Dispatch<AiGenerationAction>
): () => void {
	return useCallback(() => {
		const sessionId = readStoredSessionId(projectId);
		if (sessionId === null) {
			return;
		}
		client.ai
			.getSession({ sessionId })
			.then((detail) => {
				dispatch({
					state: {
						error: detail.session.error,
						phase: "review",
						proposals: detail.proposals.map((row) => ({
							acceptedCaseId: row.acceptedCaseId,
							id: row.id,
							proposal: row.proposal,
							status: row.status,
						})),
						sessionId,
						sessionModuleId: detail.session.moduleId,
						status: null,
						toolCalls: [],
						unavailable: false,
					},
					type: "restore",
				});
			})
			.catch(() => clearStoredSessionId(projectId));
	}, [dispatch, projectId]);
}
