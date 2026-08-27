/**
 * `SessionStore` 端口的 Postgres 适配器。
 *
 * **架构铁律**：本目录只做端口 ↔ repository 的映射，一行 SQL 都不写。
 *
 * 端口边界：这里只有「agent 跑一轮期间」的写入（落提案、更新本轮状态）。
 * 「采纳提案 → 创建真实用例」**不在这个端口里**——那是宿主的业务动作，
 * 仍走 `repositories/ai-acceptance-repository.ts` 的原路。
 */
import type {
	SessionStatusUpdate,
	SessionStore,
} from "@automationstack/agent/ports";

import { insertCaseProposals } from "../repositories/ai-proposals-repository";
import { updateGenerationSessionStatus } from "../repositories/ai-sessions-repository";

export function createSessionStore(): SessionStore {
	return {
		saveProposals: (sessionId, proposals) =>
			insertCaseProposals(sessionId, proposals),
		// 仓库返回更新后的行，端口不需要它（调用方从来没读过），这里丢掉。
		updateStatus: async (update: SessionStatusUpdate) => {
			await updateGenerationSessionStatus({
				error: update.error,
				id: update.sessionId,
				status: update.status,
			});
		},
	};
}
