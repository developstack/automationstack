import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateAll } from "../migration-harness";
import { uniformStepResultsSql } from "../repositories/test-run-step-results-sql";
import { fromStoredStepResults } from "./run-step-results-column";
import type { RunCaseStepResult } from "./test-run-enums";
import { testRunCases } from "./test-runs";

const PROJECT = "10000000-0000-4000-8000-000000000001";
const MODULE = "10000000-0000-4000-8000-000000000002";
const CASE = "10000000-0000-4000-8000-000000000003";
const RUN = "10000000-0000-4000-8000-000000000004";
const RUN_CASE = "10000000-0000-4000-8000-000000000005";

const CASE_STEPS = [
	{ expected: "登录页出现", id: "s1", step: "打开首页" },
	{ expected: "订单变已支付", id: "s2", step: "支付" },
];

/** #78 之前写入的步骤结果：失败原因和阻塞原因存在 comment 键中。 */
const OLD_STEP_RESULTS = [
	{ comment: "支付超时", result: "failed", stepId: "s1" },
	{ comment: "沙箱账号没开通", result: "blocked", stepId: "s2" },
];

async function seed(client: PGlite): Promise<void> {
	await client.query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
		PROJECT,
	]);
	await client.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '支付')",
		[MODULE, PROJECT]
	);
	await client.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '下单支付', $4::jsonb)`,
		[CASE, PROJECT, MODULE, JSON.stringify(CASE_STEPS)]
	);
	await client.query(
		"INSERT INTO test_runs (id, project_id, name) VALUES ($1, $2, '回归')",
		[RUN, PROJECT]
	);
	await client.query(
		`INSERT INTO test_run_cases (id, run_id, case_id, step_results)
		VALUES ($1, $2, $3, $4::jsonb)`,
		[RUN_CASE, RUN, CASE, JSON.stringify(OLD_STEP_RESULTS)]
	);
}

describe("步骤结果列：代码中叫 actualResult，存储键仍是 comment（#78）", () => {
	const client = new PGlite();
	const db = drizzle({ client });

	const readStepResults = async (): Promise<RunCaseStepResult[]> => {
		const [row] = await db
			.select({ stepResults: testRunCases.stepResults })
			.from(testRunCases)
			.where(eq(testRunCases.id, RUN_CASE));
		return row?.stepResults ?? [];
	};

	const readStored = async (): Promise<unknown> =>
		(
			await client.query<{ step_results: unknown }>(
				"SELECT step_results FROM test_run_cases WHERE id = $1",
				[RUN_CASE]
			)
		).rows[0]?.step_results;

	beforeAll(async () => {
		await migrateAll(client);
		await seed(client);
	}, 60_000);

	afterAll(async () => {
		await client.close();
	});

	it("reads an old failure reason and block reason as the actual result, without loss", async () => {
		expect(await readStepResults()).toEqual([
			{ actualResult: "支付超时", result: "failed", stepId: "s1" },
			{ actualResult: "沙箱账号没开通", result: "blocked", stepId: "s2" },
		]);
	});

	it("writes the actual result under the stored comment key", async () => {
		await db
			.update(testRunCases)
			.set({
				stepResults: [
					{ actualResult: "登录页正常出现", result: "passed", stepId: "s1" },
					{ actualResult: null, result: "skipped", stepId: "s2" },
				],
			})
			.where(eq(testRunCases.id, RUN_CASE));
		expect(await readStored()).toEqual([
			{ comment: "登录页正常出现", result: "passed", stepId: "s1" },
			{ comment: null, result: "skipped", stepId: "s2" },
		]);
	});

	it("reads the step results that the automation SQL writes, with the message on the last step", async () => {
		await db
			.update(testRunCases)
			.set({
				stepResults: uniformStepResultsSql({
					lastStepActualResult: sql`'expected 200, got 500'::text`,
					result: sql`'failed'::text`,
				}),
			})
			.where(eq(testRunCases.id, RUN_CASE));
		expect(await readStepResults()).toEqual([
			{ actualResult: null, result: "failed", stepId: "s1" },
			{ actualResult: "expected 200, got 500", result: "failed", stepId: "s2" },
		]);
	});
});

describe("fromStoredStepResults：驱动返回的值", () => {
	const stored = { comment: "支付超时", result: "failed", stepId: "s1" };
	const read = { actualResult: "支付超时", result: "failed", stepId: "s1" };

	it.each([
		["JSON text", JSON.stringify([stored]), [read]],
		[
			"an item without a comment key",
			[{ result: "passed", stepId: "s2" }],
			[{ actualResult: null, result: "passed", stepId: "s2" }],
		],
		[
			"an item that is not a step result",
			[stored, 3, { result: "failed" }],
			[read],
		],
		["text that is not JSON", "[", []],
		["a value that is not a list", { stepId: "s1" }, []],
	])("reads %s", (_name, value, expected) => {
		expect(fromStoredStepResults(value)).toEqual(expected);
	});
});
