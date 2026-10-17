import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { saveRunCaseStepResults } from "./test-run-step-verdicts-repository";

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

const PROJECT = "20000000-0000-4000-8000-000000000001";
const MODULE = "20000000-0000-4000-8000-000000000002";
const CASE = "20000000-0000-4000-8000-000000000003";
const RUN = "20000000-0000-4000-8000-000000000004";
const RUN_CASE = "20000000-0000-4000-8000-000000000005";

const CASE_STEPS = ["s1", "s2", "s3"].map((id) => ({
	expected: `${id} 的预期`,
	id,
	step: `${id} 的操作`,
}));

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
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '支付')",
		[MODULE, PROJECT]
	);
	await db.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '下单支付', $4::jsonb)`,
		[CASE, PROJECT, MODULE, JSON.stringify(CASE_STEPS)]
	);
	await db.query(
		"INSERT INTO test_runs (id, project_id, name, status) VALUES ($1, $2, '回归', 'in_progress')",
		[RUN, PROJECT]
	);
	await db.query(
		"INSERT INTO test_run_cases (id, run_id, case_id) VALUES ($1, $2, $3)",
		[RUN_CASE, RUN, CASE]
	);
}

function save(
	judged: Record<string, "blocked" | "failed" | "passed" | "skipped">,
	actualResults: Record<string, string>
) {
	return saveRunCaseStepResults({
		actorId: null,
		actualResults,
		caseVersion: 1,
		judged,
		runCaseId: RUN_CASE,
	});
}

describe("saveRunCaseStepResults：保存分步判定和实际结果", () => {
	beforeAll(async () => {
		await migrateAll(memoryDb());
		await seed(memoryDb());
	}, 60_000);

	afterAll(async () => {
		await memoryDb().close();
	});

	it("rejects an actual result, text or actual attachment, on a step without a verdict, and writes nothing", async () => {
		await memoryDb().query(
			`INSERT INTO test_run_attachments (run_case_id, step_id, file_name, content_type, size_bytes, storage_key)
			VALUES ($1, 's2', 'shot.png', 'image/png', 1, 'k/shot.png')`,
			[RUN_CASE]
		);
		const outcome = await save({ s1: "passed" }, { s3: "没测到这里" });
		expect(outcome).toEqual({ kind: "verdict-required", stepNumbers: [2, 3] });
		const rows = await memoryDb().query<{ result: string }>(
			"SELECT result FROM test_run_cases WHERE id = $1",
			[RUN_CASE]
		);
		expect(rows.rows).toEqual([{ result: "untested" }]);
	});

	it("rejects failed and blocked steps without an actual result, and writes nothing", async () => {
		const outcome = await save(
			{ s1: "failed", s2: "passed", s3: "blocked" },
			{ s3: "  " }
		);
		expect(outcome).toEqual({
			kind: "actual-result-required",
			stepNumbers: [1, 3],
		});
		const rows = await memoryDb().query<{ result: string }>(
			"SELECT result FROM test_run_cases WHERE id = $1",
			[RUN_CASE]
		);
		expect(rows.rows).toEqual([{ result: "untested" }]);
	});

	it("saves the actual result of every step and summarises it into the case comment", async () => {
		const outcome = await save(
			{ s1: "passed", s2: "failed" },
			{ s1: "页面正常", s2: "支付超时" }
		);
		expect(outcome.kind).toBe("ok");
		const runCase = outcome.kind === "ok" ? outcome.runCase : null;
		expect(runCase).toMatchObject({
			comment: "步骤 1：页面正常\n步骤 2：支付超时",
			result: "failed",
			stepResults: [
				{ actualResult: "页面正常", result: "passed", stepId: "s1" },
				{ actualResult: "支付超时", result: "failed", stepId: "s2" },
				{ actualResult: null, result: "skipped", stepId: "s3" },
			],
		});
	});
});
