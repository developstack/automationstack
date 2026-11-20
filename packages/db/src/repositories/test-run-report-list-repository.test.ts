import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { REPORT_PAGE_SIZE } from "./test-run-report-list-core";
import { listSubmittedReports } from "./test-run-report-list-repository";

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

const ALICE = "60000000-0000-4000-8000-000000000001";
const BOB = "60000000-0000-4000-8000-000000000002";
const MODULE = "60000000-0000-4000-8000-000000000004";
const CASE_IDS = [1, 2, 3, 4, 5].map(
	(n) => `60000000-0000-4000-8000-00000000010${n}`
);
const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

let projects = 0;

async function seedProject(): Promise<string> {
	projects += 1;
	const id = `60000000-0000-4000-8000-2000000000${String(projects).padStart(2, "0")}`;
	await memoryDb().query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		id,
	]);
	return id;
}

interface RunSeed {
	completedAt?: string;
	name?: string;
	projectId: string;
	results?: string[];
	status?: "completed" | "submitted" | "voided";
	submittedAt?: string;
	submittedBy?: string | null;
}

/** 已提交必须有提交时间（CHECK 约束），默认 1 天前；其他状态必须没有。 */
function submittedAtOf(seed: RunSeed): string | null {
	if (seed.status !== undefined && seed.status !== "submitted") {
		return null;
	}
	return seed.submittedAt ?? daysAgo(1);
}

/** 默认是已提交的测试任务。 */
async function seedRun(seed: RunSeed): Promise<string> {
	const status = seed.status ?? "submitted";
	const submittedAt = submittedAtOf(seed);
	const {
		rows: [row],
	} = await memoryDb().query<{ id: string }>(
		`INSERT INTO test_runs (project_id, name, status, submitted_at, submitted_by, completed_at, voided_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		[
			seed.projectId,
			seed.name ?? "回归",
			status,
			submittedAt,
			seed.submittedBy ?? null,
			seed.completedAt ?? null,
			status === "voided" ? daysAgo(1) : null,
		]
	);
	const runId = row?.id ?? "";
	await memoryDb().query(
		`INSERT INTO test_run_cases (run_id, case_id, result, sort_order)
		SELECT $1, c.id, r.result::test_run_case_result, c.ord - 1
		FROM unnest($2::uuid[]) WITH ORDINALITY AS c(id, ord)
		JOIN unnest($3::text[]) WITH ORDINALITY AS r(result, ord) USING (ord)`,
		[runId, CASE_IDS, seed.results ?? []]
	);
	return runId;
}

const namesOf = (page: Awaited<ReturnType<typeof listSubmittedReports>>) =>
	page.items.map((item) => item.run.name);

beforeAll(async () => {
	await migrateAll(memoryDb());
	const host = await seedProject();
	await memoryDb().query(
		"INSERT INTO users (id, username) VALUES ($1, 'alice'), ($2, 'bob')",
		[ALICE, BOB]
	);
	await memoryDb().query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '支付')",
		[MODULE, host]
	);
	await memoryDb().query(
		`INSERT INTO test_cases (id, project_id, module_id, name)
		SELECT id, $2, $3, '用例' FROM unnest($1::uuid[]) AS id`,
		[CASE_IDS, host, MODULE]
	);
}, 60_000);

afterAll(async () => {
	await memoryDb().close();
});

describe("listSubmittedReports", () => {
	it("只列出本项目已提交的测试任务，最近提交的在最前面", async () => {
		const projectId = await seedProject();
		const other = await seedProject();
		await seedRun({ name: "旧", projectId, submittedAt: daysAgo(3) });
		await seedRun({ name: "新", projectId, submittedAt: daysAgo(1) });
		await seedRun({
			completedAt: daysAgo(0),
			name: "已完成",
			projectId,
			status: "completed",
		});
		await seedRun({ name: "已作废", projectId, status: "voided" });
		await seedRun({ name: "别的项目", projectId: other });

		const page = await listSubmittedReports(projectId);

		expect(namesOf(page)).toEqual(["新", "旧"]);
		expect(page).toMatchObject({
			page: 1,
			pageSize: REPORT_PAGE_SIZE,
			total: 2,
		});
	});

	it("按名称筛选，不区分大小写", async () => {
		const projectId = await seedProject();
		await seedRun({ name: "Smoke 冒烟", projectId });
		await seedRun({ name: "回归", projectId });

		expect(
			namesOf(await listSubmittedReports(projectId, { keyword: "smoke" }))
		).toEqual(["Smoke 冒烟"]);
	});

	it.each([
		["用户 id", ALICE, ["甲"]],
		["系统自动提交", "system", ["丙"]],
	])("按提交人筛选：%s", async (_name, submitter, expected) => {
		const projectId = await seedProject();
		await seedRun({ name: "甲", projectId, submittedBy: ALICE });
		await seedRun({ name: "乙", projectId, submittedBy: BOB });
		await seedRun({ name: "丙", projectId, submittedBy: null });

		const page = await listSubmittedReports(projectId, { submitter });

		expect(namesOf(page)).toEqual(expected);
		expect(page.total).toBe(expected.length);
	});

	it("提交时间：开始时间包含，结束时间不包含", async () => {
		const projectId = await seedProject();
		const edge = "2026-01-02T00:00:00.000Z";
		await seedRun({
			name: "之前",
			projectId,
			submittedAt: "2026-01-01T23:59:59.000Z",
		});
		await seedRun({ name: "边界", projectId, submittedAt: edge });
		await seedRun({
			name: "之后",
			projectId,
			submittedAt: "2026-01-03T00:00:00.000Z",
		});

		const page = await listSubmittedReports(projectId, {
			submittedBefore: new Date("2026-01-03T00:00:00.000Z"),
			submittedFrom: new Date(edge),
		});

		expect(namesOf(page)).toEqual(["边界"]);
	});

	it("超过一页：第二页只有剩下的，total 是全部数量", async () => {
		const projectId = await seedProject();
		await memoryDb().query(
			`INSERT INTO test_runs (project_id, name, status, submitted_at)
			SELECT $1, 'r' || n, 'submitted', now() - n * interval '1 minute'
			FROM generate_series(1, $2::int) AS n`,
			[projectId, REPORT_PAGE_SIZE + 1]
		);

		const first = await listSubmittedReports(projectId);
		const second = await listSubmittedReports(projectId, { page: 2 });

		expect(first.items).toHaveLength(REPORT_PAGE_SIZE);
		expect(namesOf(second)).toEqual([`r${REPORT_PAGE_SIZE + 1}`]);
		expect(second).toMatchObject({ page: 2, total: REPORT_PAGE_SIZE + 1 });
	});

	it("每个结果的用例数和提交人名称；系统自动提交没有名称", async () => {
		const projectId = await seedProject();
		await seedRun({
			name: "有用例",
			projectId,
			results: ["passed", "passed", "failed", "blocked", "skipped"],
			submittedBy: ALICE,
		});
		await seedRun({
			name: "空",
			projectId,
			submittedAt: daysAgo(5),
		});

		const [full, empty] = (await listSubmittedReports(projectId)).items;

		expect(full?.counts).toEqual({
			blocked: 1,
			failed: 1,
			passed: 2,
			skipped: 1,
			total: 5,
			untested: 0,
		});
		expect(full?.submittedByName).toBe("alice");
		expect(empty?.counts.total).toBe(0);
		expect(empty?.submittedByName).toBeNull();
	});

	it("提交人列表：去重，不受筛选影响，系统自动提交为 {id: null, name: null}", async () => {
		const projectId = await seedProject();
		await seedRun({ name: "甲1", projectId, submittedBy: ALICE });
		await seedRun({ name: "甲2", projectId, submittedBy: ALICE });
		await seedRun({ name: "乙", projectId, submittedBy: BOB });
		await seedRun({ name: "系统", projectId });
		await seedRun({
			name: "已作废",
			projectId,
			status: "voided",
			submittedBy: BOB,
		});

		const { submitters } = await listSubmittedReports(projectId, {
			keyword: "甲",
			submitter: ALICE,
		});

		expect(submitters).toHaveLength(3);
		expect(submitters).toEqual(
			expect.arrayContaining([
				{ id: ALICE, name: "alice" },
				{ id: BOB, name: "bob" },
				{ id: null, name: null },
			])
		);
	});

	it("已完成超过自动提交天数的测试任务，先自动提交，再出现在列表里", async () => {
		const projectId = await seedProject();
		await seedRun({
			completedAt: daysAgo(10),
			name: "过期",
			projectId,
			status: "completed",
		});
		await seedRun({
			completedAt: daysAgo(0),
			name: "刚完成",
			projectId,
			status: "completed",
		});

		const page = await listSubmittedReports(projectId);

		expect(namesOf(page)).toEqual(["过期"]);
		expect(page.items[0]?.submittedByName).toBeNull();
	});
});
