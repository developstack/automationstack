import { eq } from "drizzle-orm";

import { db } from "../index";
import type { AiCaseProposal } from "../schema/ai";
import { modules } from "../schema/modules";
import {
	getCaseProposalsByIdsInTx,
	markCaseProposalAcceptedInTx,
	ProposalNotPendingError,
} from "./ai-proposals-repository";
import {
	type CreateTestCaseInput,
	createTestCaseInTx,
} from "./case-mutations-repository";
import type { DbTransaction } from "./repository-types";

/** 采纳入库的用例统一记为 AI 维护来源，v1 快照因此可追溯。 */
const AI_MAINTAINER = "AI 生成";

export interface AcceptProposalsInput {
	actorName: string | null;
	moduleId: string;
	proposalIds: string[];
}

export type AcceptProposalsResult =
	/** 成功时回带 projectId，便于调用方发布实时失效事件。 */
	| { caseIds: string[]; kind: "ok"; projectId: string }
	| { kind: "invalid-module" }
	/** 存在不属于待评审状态或不存在的提案 id。 */
	| { kind: "invalid-proposals" };

async function findModuleProjectId(
	tx: DbTransaction,
	moduleId: string
): Promise<string | null> {
	const [row] = await tx
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	return row?.projectId ?? null;
}

/** 按入参 id 顺序返回提案；任一 id 缺失或已处理则返回 null。 */
function orderPendingProposals(
	rows: AiCaseProposal[],
	ids: string[]
): AiCaseProposal[] | null {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const ordered: AiCaseProposal[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (row?.status !== "proposed") {
			return null;
		}
		ordered.push(row);
	}
	return ordered;
}

function toCreateCaseInput(
	proposal: AiCaseProposal,
	input: AcceptProposalsInput,
	projectId: string
): CreateTestCaseInput {
	const content = proposal.proposal;
	return {
		actorName: input.actorName,
		caseType: content.caseType,
		maintainer: AI_MAINTAINER,
		moduleId: input.moduleId,
		name: content.name,
		preconditions: content.preconditions,
		priority: content.priority,
		projectId,
		status: "draft",
		steps: content.steps,
		tags: content.tags,
	};
}

async function acceptProposalsInTx(
	tx: DbTransaction,
	input: AcceptProposalsInput
): Promise<AcceptProposalsResult> {
	const projectId = await findModuleProjectId(tx, input.moduleId);
	if (!projectId) {
		return { kind: "invalid-module" };
	}
	const rows = await getCaseProposalsByIdsInTx(tx, input.proposalIds);
	const ordered = orderPendingProposals(rows, input.proposalIds);
	if (!ordered) {
		return { kind: "invalid-proposals" };
	}
	const caseIds: string[] = [];
	for (const proposal of ordered) {
		// biome-ignore lint/performance/noAwaitInLoops: 单连接事务内的语句必须顺序执行
		const created = await createTestCaseInTx(
			tx,
			toCreateCaseInput(proposal, input, projectId)
		);
		if (created.kind !== "created") {
			throw new Error("acceptProposals: 目标模块不可用");
		}
		await markCaseProposalAcceptedInTx(tx, proposal.id, created.testCase.id);
		caseIds.push(created.testCase.id);
	}
	return { caseIds, kind: "ok", projectId };
}

/**
 * 采纳提案：单事务内为每条提案走 v1 快照管道创建 draft 用例，
 * 并把提案标记 accepted + 回填 acceptedCaseId。
 * 任一步骤失败则整体回滚；提案被并发抢先处理时回滚并转成
 * `invalid-proposals`，保持调用方的 typed 结果契约不变。
 */
export async function acceptProposals(
	input: AcceptProposalsInput
): Promise<AcceptProposalsResult> {
	try {
		return await db.transaction((tx) => acceptProposalsInTx(tx, input));
	} catch (error) {
		if (error instanceof ProposalNotPendingError) {
			return { kind: "invalid-proposals" };
		}
		throw error;
	}
}
