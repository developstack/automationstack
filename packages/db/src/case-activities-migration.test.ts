import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateUpTo, runMigration } from "./migration-harness";

const TAG = "0026_case_activities";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MODULE_ID = "22222222-2222-4222-8222-222222222222";
const OLD_MODULE_ID = "22222222-2222-4222-8222-222222222223";
const ALICE = "33333333-3333-4333-8333-333333333333";
const EDITED = "a0000000-0000-4000-8000-000000000001";
const UNKNOWN_SAVER = "a0000000-0000-4000-8000-000000000002";

async function seed(db: PGlite) {
	await db.query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		PROJECT_ID,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, 'm')",
		[MODULE_ID, PROJECT_ID]
	);
	await db.query("INSERT INTO users (id, username) VALUES ($1, 'alice')", [
		ALICE,
	]);
	await db.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, current_version)
		VALUES ($1, $3, $4, '登录成功', 2), ($2, $3, $4, '退出', 1)`,
		[EDITED, UNKNOWN_SAVER, PROJECT_ID, MODULE_ID]
	);
	await db.query(
		`INSERT INTO case_versions (case_id, version, saved_by, change_note, snapshot, created_at) VALUES
		($1, 1, 'alice', '创建用例', $3::jsonb, '2026-01-01T00:00:00Z'),
		($1, 2, 'alice', NULL, '{"name":"登录成功"}'::jsonb, '2026-01-02T00:00:00Z'),
		($2, 1, 'ghost', '创建用例', '{}'::jsonb, '2026-01-03T00:00:00Z')`,
		[
			EDITED,
			UNKNOWN_SAVER,
			JSON.stringify({ moduleId: OLD_MODULE_ID, name: "登录" }),
		]
	);
}

describe("迁移 0026：保存人的用户 id 和用例操作记录", () => {
	const db = new PGlite();

	beforeAll(async () => {
		await migrateUpTo(db, TAG);
		await seed(db);
		await runMigration(db, TAG);
	}, 60_000);

	afterAll(async () => {
		await db.close();
	});

	it("fills saved_by_id from the username, and keeps it empty when no user has that name", async () => {
		const { rows } = await db.query(
			"SELECT case_id, version, saved_by_id FROM case_versions ORDER BY created_at"
		);
		expect(rows).toEqual([
			{ case_id: EDITED, saved_by_id: ALICE, version: 1 },
			{ case_id: EDITED, saved_by_id: ALICE, version: 2 },
			{ case_id: UNKNOWN_SAVER, saved_by_id: null, version: 1 },
		]);
	});

	it("writes one activity for each version: version 1 is created, the others are updated", async () => {
		const { rows } = await db.query(
			`SELECT action, actor_id, actor_name, case_id, case_name, change_note, module_id, project_id, version, created_at
			FROM case_activities ORDER BY created_at`
		);
		expect(rows).toEqual([
			{
				action: "created",
				actor_id: ALICE,
				actor_name: "alice",
				case_id: EDITED,
				case_name: "登录",
				change_note: "创建用例",
				created_at: new Date("2026-01-01T00:00:00Z"),
				module_id: OLD_MODULE_ID,
				project_id: PROJECT_ID,
				version: 1,
			},
			{
				action: "updated",
				actor_id: ALICE,
				actor_name: "alice",
				case_id: EDITED,
				case_name: "登录成功",
				change_note: null,
				created_at: new Date("2026-01-02T00:00:00Z"),
				module_id: MODULE_ID,
				project_id: PROJECT_ID,
				version: 2,
			},
			{
				action: "created",
				actor_id: null,
				actor_name: "ghost",
				case_id: UNKNOWN_SAVER,
				case_name: "退出",
				change_note: "创建用例",
				created_at: new Date("2026-01-03T00:00:00Z"),
				module_id: MODULE_ID,
				project_id: PROJECT_ID,
				version: 1,
			},
		]);
	});
});
