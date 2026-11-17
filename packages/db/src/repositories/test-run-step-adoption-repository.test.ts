import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import {
	type AdoptActualAsExpectedInput,
	adoptActualAsExpected,
	findStepAdoptionSource,
} from "./test-run-step-adoption-repository";

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

const PROJECT = "30000000-0000-4000-8000-000000000001";
const MODULE = "30000000-0000-4000-8000-000000000002";
const RUN = "30000000-0000-4000-8000-000000000003";

const CASE_STEPS = [
	{ expected: "s1 的预期", id: "s1", step: "s1 的操作" },
	{
		expected: "显示「支付失败」",
		expectedScreenshots: ["30000000-0000-4000-8000-0000000000ee"],
		id: "s2",
		step: "提交订单",
	},
	{ expected: "s3 的预期", id: "s3", step: "s3 的操作" },
];

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

let seededCases = 0;

/** 每个测试使用自己的用例和执行记录，测试之间互不影响。 */
async function seedCase(): Promise<{ caseId: string; runCaseId: string }> {
	seededCases += 1;
	const suffix = String(seededCases).padStart(2, "0");
	const caseId = `30000000-0000-4000-8000-0000000001${suffix}`;
	const runCaseId = `30000000-0000-4000-8000-0000000002${suffix}`;
	await memoryDb().query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '下单支付', $4::jsonb)`,
		[caseId, PROJECT, MODULE, JSON.stringify(CASE_STEPS)]
	);
	await memoryDb().query(
		"INSERT INTO test_run_cases (id, run_id, case_id) VALUES ($1, $2, $3)",
		[runCaseId, RUN, caseId]
	);
	return { caseId, runCaseId };
}

function adopt(
	runCaseId: string,
	overrides: Partial<AdoptActualAsExpectedInput> = {}
) {
	return adoptActualAsExpected({
		actorId: null,
		actorName: "tester",
		actualResults: { s2: "显示「余额不足」", s3: "页面卡住" },
		caseVersion: 1,
		images: [],
		judged: { s1: "passed", s2: "failed", s3: "failed" },
		runCaseId,
		stepId: "s2",
		...overrides,
	});
}

async function storedCase(caseId: string) {
	const { rows } = await memoryDb().query<{
		current_version: number;
		steps: typeof CASE_STEPS;
	}>("SELECT current_version, steps FROM test_cases WHERE id = $1", [caseId]);
	return rows[0];
}

beforeAll(async () => {
	await migrateAll(memoryDb());
	await memoryDb().query(
		"INSERT INTO projects (id, name) VALUES ($1, '项目')",
		[PROJECT]
	);
	await memoryDb().query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '支付')",
		[MODULE, PROJECT]
	);
	await memoryDb().query(
		"INSERT INTO test_runs (id, project_id, name, status) VALUES ($1, $2, '回归', 'in_progress')",
		[RUN, PROJECT]
	);
}, 60_000);

afterAll(async () => {
	await memoryDb().close();
});

describe("adoptActualAsExpected：实际结果设为预期结果，这一步判定为通过", () => {
	it("writes the actual text as the expected result in a new case version, and saves all verdicts against it", async () => {
		const { caseId, runCaseId } = await seedCase();
		const outcome = await adopt(runCaseId);
		expect(outcome).toMatchObject({ kind: "ok", stepNumber: 2 });
		const stored = await storedCase(caseId);
		expect(stored?.current_version).toBe(2);
		expect(stored?.steps[1]).toEqual({
			...CASE_STEPS[1],
			expected: "显示「余额不足」",
		});
		const versions = await memoryDb().query<{ change_note: string }>(
			"SELECT change_note FROM case_versions WHERE case_id = $1",
			[caseId]
		);
		expect(versions.rows).toEqual([
			{ change_note: "用实际结果作为预期结果：测试任务「回归」第 2 步" },
		]);
		expect(outcome.kind === "ok" ? outcome.runCase : null).toMatchObject({
			caseVersion: 2,
			result: "failed",
			stepResults: [
				{ actualResult: null, result: "passed", stepId: "s1" },
				{ actualResult: "显示「余额不足」", result: "passed", stepId: "s2" },
				{ actualResult: "页面卡住", result: "failed", stepId: "s3" },
			],
		});
	});

	it("registers copied images as the expected screenshots, and keeps the expected text when there is no actual text", async () => {
		const { caseId, runCaseId } = await seedCase();
		const images = ["a", "b"].map((name) => ({
			contentType: "image/png",
			fileName: `${name}.png`,
			sizeBytes: 3,
			storageKey: `test-cases/${PROJECT}/${caseId}/${name}.png`,
		}));
		const outcome = await adopt(runCaseId, {
			actualResults: { s3: "页面卡住" },
			images,
		});
		expect(outcome.kind).toBe("ok");
		const attachments = await memoryDb().query<{
			id: string;
			storage_key: string;
		}>("SELECT id, storage_key FROM case_attachments WHERE case_id = $1", [
			caseId,
		]);
		const idByKey = new Map(
			attachments.rows.map((row) => [row.storage_key, row.id])
		);
		const stored = await storedCase(caseId);
		expect(stored?.steps[1]).toEqual({
			...CASE_STEPS[1],
			expectedScreenshots: images.map((image) => idByKey.get(image.storageKey)),
		});
	});

	it.each([
		[
			"the case changed after the run page loaded",
			{ caseVersion: 7 },
			{ currentVersion: 1, kind: "case-changed" },
		],
		[
			"the step has no actual text and no images",
			{ actualResults: { s3: "页面卡住" } },
			{ kind: "no-actual-result" },
		],
		[
			"the step is not in the case",
			{ stepId: "s9" },
			{ kind: "unknown-steps", stepIds: ["s9"] },
		],
	])("writes nothing when %s", async (_name, overrides, expected) => {
		const { caseId, runCaseId } = await seedCase();
		const images = [
			{
				contentType: "image/png",
				fileName: "a.png",
				sizeBytes: 3,
				storageKey: `test-cases/${PROJECT}/${caseId}/a.png`,
			},
		];
		const outcome = await adopt(runCaseId, {
			...overrides,
			images: "actualResults" in overrides ? [] : images,
		});
		expect(outcome).toEqual(expected);
		expect((await storedCase(caseId))?.current_version).toBe(1);
		const counts = await memoryDb().query<{ n: number }>(
			`SELECT (SELECT count(*)::int FROM case_attachments WHERE case_id = $1)
				+ (SELECT count(*)::int FROM test_run_cases WHERE id = $2 AND result <> 'untested') AS n`,
			[caseId, runCaseId]
		);
		expect(counts.rows).toEqual([{ n: 0 }]);
	});
});

describe("findStepAdoptionSource", () => {
	it("returns the case and only this step's actual attachments, in upload order", async () => {
		const { caseId, runCaseId } = await seedCase();
		await memoryDb().query(
			`INSERT INTO test_run_attachments (run_case_id, step_id, file_name, content_type, size_bytes, storage_key, created_at)
			VALUES ($1, 's2', 'second.png', 'image/png', 1, 'k/second.png', '2026-01-02'),
				($1, 's1', 'other-step.png', 'image/png', 1, 'k/other-step.png', '2026-01-01'),
				($1, 's2', 'first.png', 'image/png', 1, 'k/first.png', '2026-01-01')`,
			[runCaseId]
		);
		const source = await findStepAdoptionSource(runCaseId, "s2");
		expect(source).toMatchObject({ caseId, projectId: PROJECT });
		expect(source?.attachments.map((item) => item.fileName)).toEqual([
			"first.png",
			"second.png",
		]);
		await expect(
			findStepAdoptionSource("30000000-0000-4000-8000-0000000003ff", "s2")
		).resolves.toBeNull();
	});
});
