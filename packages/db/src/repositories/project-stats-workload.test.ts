import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { getMemberWorkload } from "./project-stats-workload";
import type { WorkloadStats } from "./project-stats-workload-core";

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

const NOW = new Date("2026-11-19T12:00:00.000Z");
const DAY_MS = 86_400_000;
const PROJECT = "50000000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "50000000-0000-4000-8000-000000000002";
const USERS = {
	alice: "50000000-0000-4000-8000-0000000000a1",
	bob: "50000000-0000-4000-8000-0000000000b1",
	carol: "50000000-0000-4000-8000-0000000000c1",
	dave: "50000000-0000-4000-8000-0000000000d1",
};

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

function daysAgo(days: number): Date {
	return new Date(NOW.getTime() - days * DAY_MS);
}

let seeded = 0;

function nextId(prefix: string): string {
	seeded += 1;
	return `50000000-0000-4000-8000-${prefix}${String(seeded).padStart(4, "0")}`;
}

async function insert(sql: string, params: unknown[]): Promise<void> {
	await memoryDb().query(sql, params);
}

/** 在项目中建一个模块、一个测试任务和测试任务中的一条用例，返回测试任务用例的 id。 */
async function seedRunCase(
	projectId: string,
	status = "in_progress"
): Promise<string> {
	const moduleId = nextId("00000001");
	const runId = nextId("00000003");
	const caseId = nextId("00000002");
	const runCaseId = nextId("00000004");
	await insert(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, 'm')",
		[moduleId, projectId]
	);
	await insert(
		"INSERT INTO test_runs (id, project_id, name, status) VALUES ($1, $2, 'r', $3)",
		[runId, projectId, status]
	);
	await insert(
		"INSERT INTO test_cases (id, project_id, module_id, name) VALUES ($1, $2, $3, 'c')",
		[caseId, projectId, moduleId]
	);
	await insert(
		"INSERT INTO test_run_cases (id, run_id, case_id) VALUES ($1, $2, $3)",
		[runCaseId, runId, caseId]
	);
	return runCaseId;
}

async function seedEvent(
	runCaseId: string,
	actorId: string,
	options: { daysAgo?: number; to?: string; via?: string } = {}
): Promise<void> {
	await insert(
		`INSERT INTO test_run_case_events
			(run_case_id, actor_id, from_result, to_result, executed_via, created_at)
		VALUES ($1, $2, 'untested', $3, $4, $5)`,
		[
			runCaseId,
			actorId,
			options.to ?? "passed",
			options.via ?? "manual",
			daysAgo(options.daysAgo ?? 0),
		]
	);
}

async function seedCreated(
	projectId: string,
	actorId: string,
	options: { action?: string; daysAgo?: number } = {}
): Promise<void> {
	await insert(
		`INSERT INTO case_activities
			(action, actor_id, case_id, case_name, module_id, project_id, version, created_at)
		VALUES ($1, $2, $3, 'c', $4, $5, 1, $6)`,
		[
			options.action ?? "created",
			actorId,
			nextId("00000002"),
			nextId("00000001"),
			projectId,
			daysAgo(options.daysAgo ?? 0),
		]
	);
}

let workload: WorkloadStats;

beforeAll(async () => {
	await migrateAll(memoryDb());
	await Promise.all(
		[
			[PROJECT, "p"],
			[OTHER_PROJECT, "other"],
		].map(([id, name]) =>
			insert("INSERT INTO projects (id, name) VALUES ($1, $2)", [id, name])
		)
	);
	await Promise.all(
		Object.entries(USERS).map(([name, id]) =>
			insert("INSERT INTO users (id, username) VALUES ($1, $2)", [id, name])
		)
	);
	// carol 不是项目成员
	await Promise.all(
		[USERS.alice, USERS.bob, USERS.dave].map((id) =>
			insert(
				"INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)",
				[PROJECT, id]
			)
		)
	);

	const a = await seedRunCase(PROJECT);
	const b = await seedRunCase(PROJECT);
	const c = await seedRunCase(PROJECT);
	const voided = await seedRunCase(PROJECT, "voided");
	const other = await seedRunCase(OTHER_PROJECT);
	// alice：同一条用例判定 3 次只算 1 条，另一条用例算第 2 条。
	// 自动化回写、改回未测、已作废测试任务中的判定都不算。
	await seedEvent(a, USERS.alice);
	await seedEvent(a, USERS.alice, { to: "failed" });
	await seedEvent(a, USERS.alice, { to: "passed" });
	await seedEvent(b, USERS.alice);
	await seedEvent(c, USERS.alice, { via: "automation" });
	await seedEvent(c, USERS.alice, { to: "untested" });
	await seedEvent(voided, USERS.alice);
	// bob：10 天前只计入 30 天，40 天前都不计入；另一个项目的判定不计入。
	await seedEvent(a, USERS.bob, { daysAgo: 10 });
	await seedEvent(b, USERS.bob, { daysAgo: 40 });
	await seedEvent(other, USERS.bob);
	// carol 不是成员，但有工作量。
	await seedEvent(c, USERS.carol);

	// 新建：只数 created。7 天和 30 天的分界。
	await seedCreated(PROJECT, USERS.alice);
	await seedCreated(PROJECT, USERS.alice);
	await seedCreated(PROJECT, USERS.alice, { daysAgo: 10 });
	await seedCreated(PROJECT, USERS.alice, { daysAgo: 40 });
	await seedCreated(PROJECT, USERS.alice, { action: "updated" });
	await seedCreated(PROJECT, USERS.alice, { action: "deleted" });
	await seedCreated(OTHER_PROJECT, USERS.bob);

	workload = await getMemberWorkload(PROJECT, NOW);
}, 60_000);

afterAll(async () => {
	await memoryDb().close();
});

const counts = (executed: number, created: number) => ({ created, executed });

it.each([
	[
		"alice：重复判定和两条用例只算 2 条，自动化、未测、已作废不算；新建只数 created，按 7 天和 30 天分开",
		"alice",
		counts(2, 2),
		counts(2, 3),
	],
	[
		"bob：10 天前的判定只计入 30 天，40 天前的不计入，另一个项目的不计入",
		"bob",
		counts(0, 0),
		counts(1, 0),
	],
	["carol：不是成员但有工作量，仍然列出", "carol", counts(1, 0), counts(1, 0)],
	["dave：没有工作量的成员显示 0", "dave", counts(0, 0), counts(0, 0)],
])("%s", (_name, username, last7Days, last30Days) => {
	const member = workload.members.find((item) => item.username === username);
	expect(member).toMatchObject({ last7Days, last30Days });
});

it("成员列表包括项目成员和有工作量的非成员，按用户名排序", () => {
	expect(workload.members.map((member) => member.username)).toEqual([
		"alice",
		"bob",
		"carol",
		"dave",
	]);
});
