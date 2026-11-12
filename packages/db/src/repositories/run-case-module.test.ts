import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { listTestCases } from "./case-list-repository";
import { moveTestCases } from "./case-move-repository";
import { listModuleFollowingRuns } from "./run-case-module";
import { addCasesToRun } from "./test-run-cases-repository";
import { getTestRunDetail } from "./test-run-detail-repository";

// 仓库使用 ../index 的连接池。测试中换成内存数据库（PGlite），执行仓库中的全部迁移。
const memory = vi.hoisted(() => ({ client: null as PGlite | null }));

vi.mock("../index", async () => {
	const { PGlite: MemoryPostgres } = await import("@electric-sql/pglite");
	const { drizzle } = await import("drizzle-orm/pglite");
	const schema = await import("../schema");
	const client = new MemoryPostgres();
	memory.client = client;
	return { db: drizzle({ client, schema }) };
});

const PROJECT = "40000000-0000-4000-8000-000000000001";
const FROM = "40000000-0000-4000-8000-000000000002";
const TO = "40000000-0000-4000-8000-000000000003";
const LOGIN = "40000000-0000-4000-8000-000000000011";
const LOGOUT = "40000000-0000-4000-8000-000000000012";
const STAY = "40000000-0000-4000-8000-000000000013";
const LATER = "40000000-0000-4000-8000-000000000014";

/** 每种状态一个测试任务，都包含「登录」。 */
const RUNS = {
	completed: "40000000-0000-4000-8000-000000000021",
	in_progress: "40000000-0000-4000-8000-000000000022",
	pending_review: "40000000-0000-4000-8000-000000000023",
	ready: "40000000-0000-4000-8000-000000000024",
	submitted: "40000000-0000-4000-8000-000000000025",
	voided: "40000000-0000-4000-8000-000000000026",
} as const;

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

async function seed(db: PGlite): Promise<void> {
	await db.query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
		PROJECT,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name, sort_order) VALUES ($1, $3, '登录', 0), ($2, $3, '账号', 1)",
		[FROM, TO, PROJECT]
	);
	// 更新时间：「登录」最早，「留下」最晚
	await db.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, sort_order, updated_at) VALUES
		($1, $5, $6, '登录', 0, now() - interval '3 day'),
		($2, $5, $6, '退出', 1, now() - interval '2 day'),
		($3, $5, $6, '留下', 2, now() - interval '1 day'),
		($4, $5, $6, '后加', 3, now() - interval '4 day')`,
		[LOGIN, LOGOUT, STAY, LATER, PROJECT, FROM]
	);
	for (const [status, id] of Object.entries(RUNS)) {
		// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
		await db.query(
			`INSERT INTO test_runs (id, project_id, name, status, submitted_at, voided_at)
			VALUES ($1, $2, $3, $4::test_run_status,
				CASE WHEN $4::text = 'submitted' THEN now() END,
				CASE WHEN $4::text = 'voided' THEN now() END)`,
			[id, PROJECT, `任务-${status}`, status]
		);
		await db.query(
			"INSERT INTO test_run_cases (run_id, case_id, module_id) VALUES ($1, $2, $3)",
			[id, LOGIN, FROM]
		);
	}
}

async function runCaseModule(runId: string, caseId: string) {
	const result = await memoryDb().query<{ module_id: string | null }>(
		"SELECT module_id FROM test_run_cases WHERE run_id = $1 AND case_id = $2",
		[runId, caseId]
	);
	return result.rows[0]?.module_id;
}

describe("测试任务中的用例记录自己的模块（ADR 0009）", () => {
	beforeAll(async () => {
		await migrateAll(memoryDb());
		await seed(memoryDb());
	}, 60_000);

	afterAll(async () => {
		await memoryDb().close();
	});

	it("用例列表按更新时间降序排列", async () => {
		const { items } = await listTestCases({ projectId: PROJECT });
		expect(items.map((testCase) => testCase.name)).toEqual([
			"留下",
			"退出",
			"登录",
			"后加",
		]);
	});

	it("移动前的预览只列出待评审、待测试和测试中的测试任务", async () => {
		const runs = await listModuleFollowingRuns([LOGIN], TO);
		// 按名称排序：任务-in_progress、任务-pending_review、任务-ready
		expect(runs.map((run) => run.status)).toEqual([
			"in_progress",
			"pending_review",
			"ready",
		]);
		expect(await listModuleFollowingRuns([LOGIN], FROM)).toEqual([]);
	});

	it("移动用例：进行中的测试任务跟着改，已完成、已提交和已作废的不改；同模块其他用例的更新时间不变", async () => {
		const before = await memoryDb().query<{ id: string; updated_at: Date }>(
			"SELECT id, updated_at FROM test_cases WHERE id IN ($1, $2) ORDER BY id",
			[LOGOUT, STAY]
		);
		const result = await moveTestCases({ caseIds: [LOGIN], moduleId: TO });
		expect(result.kind).toBe("ok");
		if (result.kind !== "ok") {
			return;
		}
		expect(new Set(result.syncedRunIds)).toEqual(
			new Set([RUNS.in_progress, RUNS.pending_review, RUNS.ready])
		);
		for (const status of ["in_progress", "pending_review", "ready"] as const) {
			// biome-ignore lint/performance/noAwaitInLoops: 逐个检查
			expect(await runCaseModule(RUNS[status], LOGIN)).toBe(TO);
		}
		for (const status of ["completed", "submitted", "voided"] as const) {
			// biome-ignore lint/performance/noAwaitInLoops: 逐个检查
			expect(await runCaseModule(RUNS[status], LOGIN)).toBe(FROM);
		}
		const after = await memoryDb().query<{ id: string; updated_at: Date }>(
			"SELECT id, updated_at FROM test_cases WHERE id IN ($1, $2) ORDER BY id",
			[LOGOUT, STAY]
		);
		expect(after.rows).toEqual(before.rows);
	});

	it("已完成的测试任务按记录的模块显示，进行中的按新模块显示", async () => {
		const completed = await getTestRunDetail(RUNS.completed);
		const inProgress = await getTestRunDetail(RUNS.in_progress);
		expect(completed?.cases[0]?.testCase.moduleName).toBe("登录");
		expect(inProgress?.cases[0]?.testCase.moduleName).toBe("账号");
	});

	it("加入测试任务时记录用例当时的模块", async () => {
		const result = await addCasesToRun({
			actorId: null,
			caseIds: [LATER],
			runId: RUNS.in_progress,
		});
		expect(result.kind).toBe("ok");
		expect(await runCaseModule(RUNS.in_progress, LATER)).toBe(FROM);
	});
});
