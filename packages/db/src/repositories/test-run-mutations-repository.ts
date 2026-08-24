import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { testRunEvents } from "../schema/test-run-events";
import { type TestRun, testRunCases, testRuns } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import type { RunLocked } from "./test-run-status-core";
import { ensureRunWritable } from "./test-run-status-repository";

/**
 * 测试任务本身的生命周期写入：新建、改名 / 改描述、删除，
 * 以及「从失败用例创建重测任务」（D11）。
 *
 * 与 `test-run-cases-repository.ts` 的分工是「任务 vs 任务里的用例行」：
 * 那边动的是范围与结论，这边动的是任务这一行本身。
 * 缺陷关联字段虽然也写在 `test_run_cases` 上，但它是 Jira 联动的一部分，
 * 独立在 `test-run-defects-repository.ts`。
 */

export interface CreateTestRunInput {
	/** 勾选的用例，按前端给定的顺序落成 `sortOrder`；重复项会被去重。 */
	caseIds: string[];
	createdBy: string | null;
	description?: string | null;
	name: string;
	projectId: string;
}

/**
 * `invalid-cases`：至少一个 `caseId` 不存在或不属于 `projectId`。
 * 整批拒绝而不是静默丢弃：用户勾了 20 条只进去 19 条，界面上看不出来。
 *
 * `empty-cases`：一条用例都没勾。空测试任务是个死胡同——0 条用例既到不了
 * `in_progress`（没有首条结论可打）也到不了 `completed`（推导要求至少有一条用例），
 * 会永久卡在 `pending_review` / `ready`。所以从新建入口就堵掉，
 * 而不是等用户建完才发现任务推不动。（`addCases` 不受影响：任务建起来之后随时可加，D13。）
 */
export type CreateTestRunResult =
	| { invalidCaseIds: string[]; kind: "invalid-cases" }
	| { kind: "created"; run: TestRun }
	| { kind: "empty-cases" };

/** 保序去重：同一条用例在一个测试任务里只能出现一次（唯一约束也会挡）。 */
function dedupe(ids: string[]): string[] {
	return [...new Set(ids)];
}

async function findInvalidCaseIds(
	tx: DbTransaction,
	projectId: string,
	caseIds: string[]
): Promise<string[]> {
	if (caseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.select({ id: testCases.id })
		.from(testCases)
		.where(
			and(eq(testCases.projectId, projectId), inArray(testCases.id, caseIds))
		);
	const owned = new Set(rows.map((row) => row.id));
	return caseIds.filter((id) => !owned.has(id));
}

/**
 * 新建测试任务 + 批量落用例行 + 首条状态事件，**同一个事务**内完成。
 *
 * 拆成多次独立写入会留下「任务建好了但一条用例都没有」的中间态，
 * 而这种任务在界面上和「刚建的空任务」长得一模一样，没人能发现它是残的。
 *
 * 首条 `test_run_events`（`fromStatus: null → toStatus: 'pending_review'`）
 * 必须在这里就写：审计流水一旦允许有缺口，「这个测试任务是谁什么时候建的」
 * 就得回退去读 `test_runs.createdBy`，时间线上少一环就再也补不回来了。
 */
export async function createTestRunInTx(
	tx: DbTransaction,
	input: CreateTestRunInput
): Promise<CreateTestRunResult> {
	const caseIds = dedupe(input.caseIds);
	// 服务端这道不能只靠前端禁用按钮：新建入口将来可能来自 MCP 或脚本。
	if (caseIds.length === 0) {
		return { kind: "empty-cases" };
	}
	const invalidCaseIds = await findInvalidCaseIds(tx, input.projectId, caseIds);
	if (invalidCaseIds.length > 0) {
		return { invalidCaseIds, kind: "invalid-cases" };
	}
	const [run] = await tx
		.insert(testRuns)
		.values({
			createdBy: input.createdBy,
			description: input.description ?? null,
			name: input.name,
			projectId: input.projectId,
		})
		.returning();
	if (!run) {
		throw new Error("createTestRun: insert returned no row");
	}
	await tx.insert(testRunCases).values(
		caseIds.map((caseId, sortOrder) => ({
			caseId,
			runId: run.id,
			sortOrder,
		}))
	);
	await tx.insert(testRunEvents).values({
		actorId: input.createdBy,
		fromStatus: null,
		runId: run.id,
		toStatus: "pending_review",
	});
	return { kind: "created", run };
}

export function createTestRun(
	input: CreateTestRunInput
): Promise<CreateTestRunResult> {
	return db.transaction((tx) => createTestRunInTx(tx, input));
}

export interface UpdateTestRunInput {
	description?: string | null;
	name?: string;
	runId: string;
}

export type UpdateTestRunResult =
	| RunLocked
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

/**
 * 改测试任务的名称 / 描述。同样要过 `ensureRunWritable`：任务名会印在交出去的报告上，
 * 已提交后改名等于事后改写一份已发布文档的标题（D15「一切不可改」）。
 */
export function updateTestRun(
	input: UpdateTestRunInput
): Promise<UpdateTestRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const patch: Partial<typeof testRuns.$inferInsert> = {};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (Object.keys(patch).length === 0) {
			return { kind: "ok" as const, run: writable.run };
		}
		const [updated] = await tx
			.update(testRuns)
			.set(patch)
			.where(eq(testRuns.id, input.runId))
			.returning();
		if (!updated) {
			throw new Error("updateTestRun: update returned no row");
		}
		return { kind: "ok" as const, run: updated };
	});
}

export type RemoveTestRunResult =
	| RunLocked
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

/**
 * 删除测试任务。`test_run_cases` / `test_run_attachments` / `test_run_events` 都是
 * `onDelete: cascade`，跟着一起走——测试任务是它们存在的唯一理由。
 *
 * 与用例删除（`onDelete: restrict`，plan §3.4）的区别在于方向：删用例会让**别人的**
 * 历史报告悄悄变数，删测试任务只影响这个任务自己。
 *
 * **已提交的测试任务删不掉**（过 `ensureRunWritable`，返回 `locked`）。D15 冻结保护的是
 * 报告的权威性，而整份报告被删掉比其中一个数字被改掉破坏性更大；只冻结编辑却
 * 放行删除是自相矛盾的——想抹掉不利结论的人会直接删掉重开。
 *
 * 已知代价：建错的测试任务一旦超时自动提交就永远删不掉，列表会攒垃圾。这是**杂乱**，
 * 不是**数据损坏**，两者严重性差一个量级。正确的出口是将来加「归档」
 * （从默认列表隐藏、报告仍可访问），不是放开删除。
 */
export function removeTestRun(runId: string): Promise<RemoveTestRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const [removed] = await tx
			.delete(testRuns)
			.where(eq(testRuns.id, runId))
			.returning();
		if (!removed) {
			throw new Error("removeTestRun: delete returned no row");
		}
		return { kind: "ok" as const, run: removed };
	});
}

export interface CreateTestRunFromFailedInput {
	createdBy: string | null;
	description?: string | null;
	name: string;
	sourceRunId: string;
}

export type CreateTestRunFromFailedResult =
	| CreateTestRunResult
	| { kind: "no-failed-cases" }
	| { kind: "source-not-found" };

/**
 * 「从 XX 的失败用例创建」重测任务（D11）。
 *
 * 不做「轮次」这个概念：重测就是一个新的测试任务，它有自己的评审、自己的报告、
 * 自己的提交。把重测做成同一个任务的第二轮，就得回答「报告展示哪一轮的数字」，
 * 而这个问题没有不别扭的答案。
 *
 * 顺带这是 `submitted` 终态唯一的「出路」：已提交的测试任务要继续测，就从它建重测任务。
 */
export function createTestRunFromFailed(
	input: CreateTestRunFromFailedInput
): Promise<CreateTestRunFromFailedResult> {
	return db.transaction(async (tx) => {
		const [source] = await tx
			.select({ projectId: testRuns.projectId })
			.from(testRuns)
			.where(eq(testRuns.id, input.sourceRunId))
			.limit(1);
		if (!source) {
			return { kind: "source-not-found" as const };
		}
		const rows = await tx
			.select({ caseId: testRunCases.caseId })
			.from(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, input.sourceRunId),
					eq(testRunCases.result, "failed")
				)
			)
			.orderBy(asc(testRunCases.sortOrder), asc(testRunCases.createdAt));
		if (rows.length === 0) {
			return { kind: "no-failed-cases" as const };
		}
		return await createTestRunInTx(tx, {
			caseIds: rows.map((row) => row.caseId),
			createdBy: input.createdBy,
			description: input.description ?? null,
			name: input.name,
			projectId: source.projectId,
		});
	});
}
