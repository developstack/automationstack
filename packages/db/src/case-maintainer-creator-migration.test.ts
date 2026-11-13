import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateUpTo, runMigration } from "./migration-harness";

const TAG = "0025_case_maintainer_creator";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MODULE_ID = "22222222-2222-4222-8222-222222222222";
const OLD_UPDATED_AT = "2026-01-02T03:04:05.000Z";

interface SeedCase {
	id: string;
	maintainer: string | null;
	/** 按版本号的保存人 */
	savers: (string | null)[];
}

const CASES = {
	blank: {
		id: "a0000000-0000-4000-8000-000000000002",
		maintainer: "  ",
		savers: ["bob"],
	},
	empty: {
		id: "a0000000-0000-4000-8000-000000000001",
		maintainer: null,
		savers: ["alice", "bob"],
	},
	firstUnknown: {
		id: "a0000000-0000-4000-8000-000000000003",
		maintainer: null,
		savers: [null, "carol"],
	},
	kept: {
		id: "a0000000-0000-4000-8000-000000000004",
		maintainer: "dave",
		savers: ["alice"],
	},
	noSaver: {
		id: "a0000000-0000-4000-8000-000000000005",
		maintainer: null,
		savers: [null],
	},
} satisfies Record<string, SeedCase>;

async function seed(db: PGlite) {
	await db.query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		PROJECT_ID,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, 'm')",
		[MODULE_ID, PROJECT_ID]
	);
	for (const testCase of Object.values(CASES)) {
		// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
		await db.query(
			"INSERT INTO test_cases (id, project_id, module_id, name, maintainer, updated_at) VALUES ($1, $2, $3, 'c', $4, $5)",
			[testCase.id, PROJECT_ID, MODULE_ID, testCase.maintainer, OLD_UPDATED_AT]
		);
		for (const [index, saver] of testCase.savers.entries()) {
			// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
			await db.query(
				"INSERT INTO case_versions (case_id, version, saved_by, snapshot) VALUES ($1, $2, $3, '{}'::jsonb)",
				[testCase.id, index + 1, saver]
			);
		}
	}
}

describe("迁移 0025：维护人为空的用例，维护人改为创建者", () => {
	const db = new PGlite();
	let after: Map<string, { maintainer: string | null; updatedAt: string }>;

	beforeAll(async () => {
		await migrateUpTo(db, TAG);
		await seed(db);
		await runMigration(db, TAG);
		const { rows } = await db.query<{
			id: string;
			maintainer: string | null;
			updated_at: Date;
		}>("SELECT id, maintainer, updated_at FROM test_cases");
		after = new Map(
			rows.map((row) => [
				row.id,
				{ maintainer: row.maintainer, updatedAt: row.updated_at.toISOString() },
			])
		);
	}, 60_000);

	afterAll(async () => {
		await db.close();
	});

	it.each([
		["维护人为空：第 1 个版本的保存人", CASES.empty, "alice"],
		["维护人只有空格：第 1 个版本的保存人", CASES.blank, "bob"],
		["第 1 个版本没有保存人：最早有保存人的版本", CASES.firstUnknown, "carol"],
		["已有维护人：不变", CASES.kept, "dave"],
		["所有版本都没有保存人：不变", CASES.noSaver, null],
	])("%s", (_name, testCase, expected) => {
		expect(after.get(testCase.id)).toEqual({
			maintainer: expected,
			updatedAt: OLD_UPDATED_AT,
		});
	});
});
