import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "../index";
import { migrateAll } from "../migration-harness";
import { writeCaseMutation } from "./case-snapshot-core";
import { removeModule } from "./modules-repository";
import { removeTestCase, removeTestCases } from "./test-cases-repository";

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
const ALICE = "40000000-0000-4000-8000-0000000000a1";
const ACTOR = { actorId: ALICE, actorName: "alice" };

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

let seeded = 0;

function nextId(prefix: string): string {
	seeded += 1;
	return `40000000-0000-4000-8000-${prefix}${String(seeded).padStart(4, "0")}`;
}

async function seedModule(parentId: string | null = null): Promise<string> {
	const id = nextId("00000001");
	await memoryDb().query(
		"INSERT INTO modules (id, project_id, parent_id, name) VALUES ($1, $2, $3, 'm')",
		[id, PROJECT, parentId]
	);
	return id;
}

async function seedCase(moduleId: string, name: string): Promise<string> {
	const id = nextId("00000002");
	await memoryDb().query(
		"INSERT INTO test_cases (id, project_id, module_id, name) VALUES ($1, $2, $3, $4)",
		[id, PROJECT, moduleId, name]
	);
	return id;
}

interface ActivityRow {
	action: string;
	actor_id: string | null;
	actor_name: string | null;
	case_name: string;
	created_at: Date;
	version: number;
}

async function activitiesOf(caseIds: readonly string[]) {
	const { rows } = await memoryDb().query<ActivityRow>(
		`SELECT action, actor_id, actor_name, case_name, created_at, version
		FROM case_activities WHERE case_id = ANY($1::uuid[]) ORDER BY case_name, version`,
		[caseIds]
	);
	return rows;
}

const without = ({ created_at: _createdAt, ...row }: ActivityRow) => row;

beforeAll(async () => {
	await migrateAll(memoryDb());
	await memoryDb().query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		PROJECT,
	]);
	await memoryDb().query(
		"INSERT INTO users (id, username) VALUES ($1, 'alice')",
		[ALICE]
	);
}, 60_000);

afterAll(async () => {
	await memoryDb().close();
});

describe("用例操作记录", () => {
	it("a new version records an update with the saver's id, and the version stores the id too", async () => {
		const caseId = await seedCase(await seedModule(), "登录");
		const written = await db.transaction((tx) =>
			writeCaseMutation(tx, {
				...ACTOR,
				caseId,
				changeNote: "回滚至 v1",
				patch: { name: "登录成功" },
			})
		);
		expect(written.kind === "written" ? written.version.savedById : null).toBe(
			ALICE
		);
		const { rows } = await memoryDb().query(
			"SELECT change_note FROM case_activities WHERE case_id = $1",
			[caseId]
		);
		expect(rows).toEqual([{ change_note: "回滚至 v1" }]);
		expect((await activitiesOf([caseId])).map(without)).toEqual([
			{
				action: "updated",
				actor_id: ALICE,
				actor_name: "alice",
				case_name: "登录成功",
				version: 2,
			},
		]);
	});

	it("a write without changes records nothing", async () => {
		const caseId = await seedCase(await seedModule(), "退出");
		await db.transaction((tx) =>
			writeCaseMutation(tx, { ...ACTOR, caseId, patch: { name: "退出" } })
		);
		expect(await activitiesOf([caseId])).toEqual([]);
	});

	it("a deleted case keeps its deletion record, and one bulk delete has one created_at", async () => {
		const moduleId = await seedModule();
		const single = await seedCase(moduleId, "单条");
		const bulk = [
			await seedCase(moduleId, "批量 1"),
			await seedCase(moduleId, "批量 2"),
		];
		await removeTestCase(single, ACTOR);
		await removeTestCases({ actor: ACTOR, caseIds: bulk, projectId: PROJECT });
		const rows = await activitiesOf([single, ...bulk]);
		expect(rows.map(without)).toEqual(
			["单条", "批量 1", "批量 2"].map((name) => ({
				action: "deleted",
				actor_id: ALICE,
				actor_name: "alice",
				case_name: name,
				version: 1,
			}))
		);
		const [, first, second] = rows;
		expect(first?.created_at).toEqual(second?.created_at);
	});

	it("deleting a module records each case of its subtree as deleted", async () => {
		const root = await seedModule();
		const child = await seedModule(root);
		const cases = [await seedCase(root, "上级"), await seedCase(child, "下级")];
		await removeModule(root, ACTOR);
		expect(
			(await activitiesOf(cases)).map(({ action, case_name }) => ({
				action,
				case_name,
			}))
		).toEqual([
			{ action: "deleted", case_name: "上级" },
			{ action: "deleted", case_name: "下级" },
		]);
	});

	it("a delete blocked by a test run records nothing", async () => {
		const caseId = await seedCase(await seedModule(), "被引用");
		const runId = nextId("00000003");
		await memoryDb().query(
			"INSERT INTO test_runs (id, project_id, name) VALUES ($1, $2, 'r')",
			[runId, PROJECT]
		);
		await memoryDb().query(
			"INSERT INTO test_run_cases (run_id, case_id) VALUES ($1, $2)",
			[runId, caseId]
		);
		await expect(removeTestCase(caseId, ACTOR)).resolves.toMatchObject({
			kind: "blocked",
		});
		expect(await activitiesOf([caseId])).toEqual([]);
	});
});
