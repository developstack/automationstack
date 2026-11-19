import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateUpTo, runMigration } from "./migration-harness";

const TAG = "0027_run_case_event_executed_via";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MODULE_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const AUTO_CASE_ID = "a0000000-0000-4000-8000-000000000001";
const MANUAL_CASE_ID = "a0000000-0000-4000-8000-000000000002";
const AUTO_RUN_CASE_ID = "b0000000-0000-4000-8000-000000000001";
const MANUAL_RUN_CASE_ID = "b0000000-0000-4000-8000-000000000002";
const OLD_AT = "2026-03-01T01:00:00.000Z";
const LAST_AT = "2026-03-02T02:00:00.000Z";

const EVENTS = {
	automationLast: "c0000000-0000-4000-8000-000000000001",
	automationOlder: "c0000000-0000-4000-8000-000000000002",
	manual: "c0000000-0000-4000-8000-000000000003",
	untested: "c0000000-0000-4000-8000-000000000004",
} as const;

async function seedRunCases(db: PGlite) {
	await db.query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		PROJECT_ID,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, 'm')",
		[MODULE_ID, PROJECT_ID]
	);
	await db.query(
		"INSERT INTO test_runs (id, project_id, name) VALUES ($1, $2, 'r')",
		[RUN_ID, PROJECT_ID]
	);
	for (const [caseId, runCaseId, via] of [
		[AUTO_CASE_ID, AUTO_RUN_CASE_ID, "automation"],
		[MANUAL_CASE_ID, MANUAL_RUN_CASE_ID, "manual"],
	]) {
		// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
		await db.query(
			"INSERT INTO test_cases (id, project_id, module_id, name) VALUES ($1, $2, $3, 'c')",
			[caseId, PROJECT_ID, MODULE_ID]
		);
		await db.query(
			"INSERT INTO test_run_cases (id, run_id, case_id, result, executed_via, executed_at) VALUES ($1, $2, $3, 'passed', $4, $5)",
			[runCaseId, RUN_ID, caseId, via, LAST_AT]
		);
	}
}

async function seedEvents(db: PGlite) {
	const rows = [
		[EVENTS.automationOlder, AUTO_RUN_CASE_ID, "untested", "failed", OLD_AT],
		[EVENTS.automationLast, AUTO_RUN_CASE_ID, "failed", "passed", LAST_AT],
		[EVENTS.manual, MANUAL_RUN_CASE_ID, "untested", "passed", LAST_AT],
		[EVENTS.untested, MANUAL_RUN_CASE_ID, "passed", "untested", OLD_AT],
	];
	for (const row of rows) {
		// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
		await db.query(
			"INSERT INTO test_run_case_events (id, run_case_id, from_result, to_result, created_at) VALUES ($1, $2, $3, $4, $5)",
			row
		);
	}
}

describe("迁移 0027：已有的判定流水补上判定方式", () => {
	const db = new PGlite();
	let after: Map<string, string | null>;

	beforeAll(async () => {
		await migrateUpTo(db, TAG);
		await seedRunCases(db);
		await seedEvents(db);
		await runMigration(db, TAG);
		const { rows } = await db.query<{
			executed_via: string | null;
			id: string;
		}>("SELECT id, executed_via FROM test_run_case_events");
		after = new Map(rows.map((row) => [row.id, row.executed_via]));
	}, 60_000);

	afterAll(async () => {
		await db.close();
	});

	it.each([
		[
			"最后一次自动化回写、时间相同的判定：自动化",
			EVENTS.automationLast,
			"automation",
		],
		["同一用例更早的判定：手动", EVENTS.automationOlder, "manual"],
		["手动用例的判定：手动", EVENTS.manual, "manual"],
		["改回未测的记录：保持为空", EVENTS.untested, null],
	])("%s", (_name, eventId, expected) => {
		expect(after.get(eventId)).toBe(expected);
	});
});
