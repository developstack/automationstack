import { and, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testRunCases } from "../schema/test-runs";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import type { RunLocked } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

/**
 * 附件的**归属解析与直传签名前置守卫**（plan §3.1 / §5.6）。
 *
 * 从 `test-run-attachments-repository.ts` 拆出来的是「presign 之前要做什么」
 * 这一段：查用例行归属、在同一个事务里过 `submitted` 守卫、把 api 层拼
 * object key 需要的 `AttachmentScope` 交出去。登记 / 列表 / 删除三条动
 * `test_run_attachments` 表的路径仍在原文件。
 *
 * 拆分依据是**这一段一行都不碰附件表**：它只读 `test_run_cases` 与 `test_runs`，
 * 产出的是给 api 层的坐标，而不是附件元数据。手工单条（`prepareAttachmentUpload`）
 * 与自动化整批（`prepareRunAttachmentUploads`）是同一件事的两个规模，
 * 放在一起才看得出它们共用同一个 `ensureRunWritable` 守卫。
 *
 * 本文件里的每一个导出仍然从 `test-run-attachments-repository.ts` re-export，
 * 调用方（`routers/test-run-attachments.ts`、`lib/ingest/attachment-uploads.ts`）
 * 的 import 路径不变。
 */

/** 附件挂靠的那条用例行，以及它所在的测试任务与项目——api 层拼 object key 要用。 */
export interface AttachmentScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

export type PrepareAttachmentUploadResult =
	| RunLocked
	| RepositoryNotFound
	| { kind: "ok"; scope: AttachmentScope };

/**
 * 查出用例行的归属并确认测试任务可写——**presign 之前**必须走这一遭。
 *
 * 为什么 presign 也要过 `submitted` 守卫：签名一发出去就是一张我们收不回的
 * 写入凭证，只在 `register` 拦等于让已提交的测试任务照样能被塞进新对象，
 * 拦下的只是「数据库里看不见」，bucket 里已经多了东西。
 *
 * `ensureRunWritable` 内部含 `SELECT ... FOR UPDATE`，所以查归属与判状态
 * 必须在**同一个事务**里：分两次查就是 TOCTOU——查完到用的这段时间里，
 * 别人完全可以把测试任务提交掉。
 */
export function prepareAttachmentUpload(
	runCaseId: string
): Promise<PrepareAttachmentUploadResult> {
	return db.transaction(async (tx) => {
		const runId = await findRunIdInTx(tx, runCaseId);
		if (runId === null) {
			return { kind: "not-found" };
		}
		const writable = await ensureRunWritable(tx, runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		return {
			kind: "ok",
			scope: { projectId: writable.run.projectId, runCaseId, runId },
		};
	});
}

/**
 * 用例行所属的测试任务 id。
 *
 * 这里只取 runId 而不顺手 join `test_runs` 拿 projectId：紧接着的
 * `ensureRunWritable` 会把那一行 `FOR UPDATE` 锁住并整行读出来，
 * projectId 从它的返回值上取即可，多 join 一次只是把同一行读两遍，
 * 还会让「哪一次读到的才算数」变成一个要想的问题。
 *
 * 导出是因为 `registerAttachment`（仍在 `test-run-attachments-repository.ts`）
 * 也要用它：登记时必须再查一次归属、再过一次守卫，理由见那边的注释。
 */
export async function findRunIdInTx(
	tx: DbTransaction,
	runCaseId: string
): Promise<string | null> {
	const [row] = await tx
		.select({ runId: testRunCases.runId })
		.from(testRunCases)
		.where(eq(testRunCases.id, runCaseId));
	return row?.runId ?? null;
}

export interface PrepareRunAttachmentUploadsInput {
	/** 要签名的用例行；不属于 `runId` 的会被安静地滤掉，由调用方对差集负责。 */
	runCaseIds: string[];
	runId: string;
}

export type PrepareRunAttachmentUploadsResult =
	| RunLocked
	| RepositoryNotFound
	| {
			kind: "ok";
			/** **只含真正属于这个测试任务的用例行**，顺序不保证，调用方按 id 取用。 */
			scopes: AttachmentScope[];
	  };

/**
 * `prepareAttachmentUpload` 的**按任务批量版**，给自动化上报的附件通道用（plan §5.6）。
 *
 * 为什么要有它，而不是对每条用例行各调一次 `prepareAttachmentUpload`：
 * 一次自动化执行可能带几百个附件，逐条调用就是几百个事务、几百次
 * `SELECT ... FOR UPDATE` 同一行 `test_runs`——同一把行锁反复抢放，
 * 纯属把 §5.3「不许 N+1」在附件这条路上重演一遍。
 *
 * **守卫仍然是同一个 `ensureRunWritable`**，不另写判据：已提交的测试任务
 * 一个 URL 都不发。它在事务内对 `test_runs` 加 `FOR UPDATE`，所以
 * 「判状态」与「取归属」必须在同一个事务里——分两次查就是 TOCTOU。
 *
 * ⚠️ 只判 `submitted`。「待评审」不在这里拦，与手工路径保持完全一致：
 * 那一层由 `resolveAutomationTargets` 带回的 `runStatus` 在 api 层先摘掉
 * （同 `execution-reconcile.ts` 的做法），这样拒绝理由里能说出是哪个任务。
 *
 * 传进来但不属于这个任务的 id 不会出现在 `scopes` 里（用例范围可能在
 * 解析之后、签名之前被人改动）。**不为此报错**：调用方按差集逐条说明即可，
 * 一条被移出范围的用例不该让整批附件失败。
 */
export function prepareRunAttachmentUploads(
	input: PrepareRunAttachmentUploadsInput
): Promise<PrepareRunAttachmentUploadsResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		if (input.runCaseIds.length === 0) {
			return { kind: "ok", scopes: [] };
		}
		const rows = await tx
			.select({ runCaseId: testRunCases.id })
			.from(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, input.runId),
					inArray(testRunCases.id, input.runCaseIds)
				)
			);
		return {
			kind: "ok",
			scopes: rows.map((row) => ({
				projectId: writable.run.projectId,
				runCaseId: row.runCaseId,
				runId: input.runId,
			})),
		};
	});
}
