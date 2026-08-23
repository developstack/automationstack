import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import type { AiCaseProposal, ProposedCase } from "../schema/ai";
import { aiCaseProposals } from "../schema/ai";
import type { DbTransaction } from "./repository-types";

async function countProposals(sessionId: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(aiCaseProposals)
		.where(eq(aiCaseProposals.sessionId, sessionId));
	return row?.value ?? 0;
}

/**
 * 批量写入一批提案（agent 的 propose_cases 可多次调用，逐批追加）。
 * 返回的 id 顺序与 `proposals` 入参顺序严格一致。
 */
export async function insertCaseProposals(
	sessionId: string,
	proposals: ProposedCase[]
): Promise<string[]> {
	if (proposals.length === 0) {
		return [];
	}
	const offset = await countProposals(sessionId);
	const rows = await db
		.insert(aiCaseProposals)
		.values(
			proposals.map((proposal, index) => ({
				proposal,
				sessionId,
				sortOrder: offset + index,
			}))
		)
		.returning({
			id: aiCaseProposals.id,
			sortOrder: aiCaseProposals.sortOrder,
		});
	return [...rows]
		.sort((left, right) => left.sortOrder - right.sortOrder)
		.map((row) => row.id);
}

/** 会话下的全部提案，按提交顺序返回（供刷新后恢复评审列表）。 */
export function listCaseProposalsBySession(
	sessionId: string
): Promise<AiCaseProposal[]> {
	return db
		.select()
		.from(aiCaseProposals)
		.where(eq(aiCaseProposals.sessionId, sessionId))
		.orderBy(asc(aiCaseProposals.sortOrder), asc(aiCaseProposals.createdAt));
}

export function getCaseProposalsByIds(
	ids: string[]
): Promise<AiCaseProposal[]> {
	if (ids.length === 0) {
		return Promise.resolve([]);
	}
	return db
		.select()
		.from(aiCaseProposals)
		.where(inArray(aiCaseProposals.id, ids));
}

/**
 * 采纳事务内读取提案并对命中行加 `FOR UPDATE` 行锁。
 * 并发采纳同一批提案时，后到的事务会阻塞到先提交者结束，
 * 再读到的状态已是 `accepted`，从而落入 invalid-proposals 分支。
 */
export function getCaseProposalsByIdsInTx(
	tx: DbTransaction,
	ids: string[]
): Promise<AiCaseProposal[]> {
	if (ids.length === 0) {
		return Promise.resolve([]);
	}
	return tx
		.select()
		.from(aiCaseProposals)
		.where(inArray(aiCaseProposals.id, ids))
		.for("update");
}

/**
 * 提案在采纳事务内已不处于 `proposed`（被并发抢先处理）。
 * 抛出以强制整个采纳事务回滚，由 `acceptProposals` 转成 typed 结果。
 */
export class ProposalNotPendingError extends Error {
	constructor(id: string) {
		super(`提案 ${id} 已被并发处理，无法采纳`);
		this.name = "ProposalNotPendingError";
	}
}

/**
 * 采纳提案后回填对应用例 id（在采纳事务内调用）。
 * WHERE 带 `status = 'proposed'` 条件兜底：未更新到行即抛错回滚。
 */
export async function markCaseProposalAcceptedInTx(
	tx: DbTransaction,
	id: string,
	acceptedCaseId: string
): Promise<void> {
	const rows = await tx
		.update(aiCaseProposals)
		.set({ acceptedCaseId, status: "accepted" })
		.where(
			and(eq(aiCaseProposals.id, id), eq(aiCaseProposals.status, "proposed"))
		)
		.returning({ id: aiCaseProposals.id });
	if (rows.length === 0) {
		throw new ProposalNotPendingError(id);
	}
}

/** 批量拒绝仍待评审的提案，返回真正被更新的提案 id。 */
export async function rejectCaseProposals(ids: string[]): Promise<string[]> {
	if (ids.length === 0) {
		return [];
	}
	const rows = await db
		.update(aiCaseProposals)
		.set({ status: "rejected" })
		.where(
			and(
				inArray(aiCaseProposals.id, ids),
				eq(aiCaseProposals.status, "proposed")
			)
		)
		.returning({ id: aiCaseProposals.id });
	return rows.map((row) => row.id);
}
