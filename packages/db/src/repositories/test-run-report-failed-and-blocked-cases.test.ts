import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { loadFailedAndBlockedCases } from "./test-run-report-failed-and-blocked-cases";

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

const PROJECT = "31000000-0000-4000-8000-000000000001";
const MODULE = "31000000-0000-4000-8000-000000000002";
const RUN = "31000000-0000-4000-8000-000000000003";
const EMPTY_RUN = "31000000-0000-4000-8000-000000000004";

/** 一条用例和它在测试任务中的一行：执行结果、步骤和步骤结果（存储键是 comment）。 */
interface SeedCase {
	id: string;
	name: string;
	result: "blocked" | "failed" | "passed";
	runCaseId: string;
	sortOrder: number;
	stepIds: string[];
	stepResults: { comment: string | null; result: string; stepId: string }[];
}

const CHECKOUT: SeedCase = {
	id: "31000000-0000-4000-8000-000000000011",
	name: "下单支付",
	result: "failed",
	runCaseId: "31000000-0000-4000-8000-000000000021",
	sortOrder: 1,
	stepIds: ["s1", "s2", "s3"],
	stepResults: [
		{ comment: null, result: "passed", stepId: "s1" },
		{ comment: "页面白屏", result: "failed", stepId: "s2" },
	],
};

const REFUND: SeedCase = {
	id: "31000000-0000-4000-8000-000000000012",
	name: "退款",
	result: "failed",
	runCaseId: "31000000-0000-4000-8000-000000000022",
	sortOrder: 2,
	stepIds: ["r1"],
	stepResults: [],
};

const LOGIN: SeedCase = {
	id: "31000000-0000-4000-8000-000000000013",
	name: "登录",
	result: "passed",
	runCaseId: "31000000-0000-4000-8000-000000000023",
	sortOrder: 3,
	stepIds: ["l1"],
	stepResults: [{ comment: null, result: "passed", stepId: "l1" }],
};

/** 排在失败用例前面的阻塞用例：报告中仍然排在失败用例后面。 */
const SANDBOX: SeedCase = {
	id: "31000000-0000-4000-8000-000000000014",
	name: "沙箱支付",
	result: "blocked",
	runCaseId: "31000000-0000-4000-8000-000000000024",
	sortOrder: 0,
	stepIds: ["b1"],
	stepResults: [{ comment: "沙箱账号没开通", result: "blocked", stepId: "b1" }],
};

/** 附件：[用例行, 步骤 id（null 是整条用例的附件）, 文件名]，按这个顺序上传。 */
const ATTACHMENTS: [string, string | null, string][] = [
	[CHECKOUT.runCaseId, "s2", "白屏.png"],
	[LOGIN.runCaseId, "l1", "登录.png"],
	[CHECKOUT.runCaseId, null, "自动化.log"],
	[CHECKOUT.runCaseId, "s9", "已删除步骤.mp4"],
	[SANDBOX.runCaseId, "b1", "沙箱报错.png"],
];

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

async function seedCase(db: PGlite, item: SeedCase): Promise<void> {
	const steps = item.stepIds.map((id) => ({
		expected: `${id} 的预期`,
		id,
		step: `${id} 的操作`,
	}));
	await db.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, $4, $5::jsonb)`,
		[item.id, PROJECT, MODULE, item.name, JSON.stringify(steps)]
	);
	await db.query(
		`INSERT INTO test_run_cases (id, run_id, case_id, result, sort_order, step_results)
		VALUES ($1, $2, $3, $4::test_run_case_result, $5, $6::jsonb)`,
		[
			item.runCaseId,
			RUN,
			item.id,
			item.result,
			item.sortOrder,
			JSON.stringify(item.stepResults),
		]
	);
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
		"INSERT INTO test_runs (id, project_id, name, status) VALUES ($1, $2, '回归', 'completed'), ($3, $2, '空任务', 'completed')",
		[RUN, PROJECT, EMPTY_RUN]
	);
	for (const item of [CHECKOUT, REFUND, LOGIN, SANDBOX]) {
		// biome-ignore lint/performance/noAwaitInLoops: 种子数据，顺序插入更容易读
		await seedCase(db, item);
	}
	for (const [index, [runCaseId, stepId, fileName]] of ATTACHMENTS.entries()) {
		// biome-ignore lint/performance/noAwaitInLoops: created_at 决定上传顺序
		await db.query(
			`INSERT INTO test_run_attachments
			(run_case_id, step_id, file_name, content_type, size_bytes, storage_key, created_at)
			VALUES ($1, $2, $3, 'image/png', 1024, $4, now() + make_interval(secs => $5))`,
			[runCaseId, stepId, fileName, `key-${index}`, index]
		);
	}
}

describe("报告中的失败和阻塞用例：每个步骤的实际结果和全部附件", () => {
	beforeAll(async () => {
		await migrateAll(memoryDb());
		await seed(memoryDb());
	}, 60_000);

	afterAll(async () => {
		await memoryDb().close();
	});

	it("returns failed cases first, then blocked cases, each with its result and current steps in order with their actual result text", async () => {
		const cases = await loadFailedAndBlockedCases(RUN);
		expect(cases.map((item) => [item.name, item.result, item.steps])).toEqual([
			[
				"下单支付",
				"failed",
				[
					{ actualResult: null, id: "s1", position: 1, step: "s1 的操作" },
					{
						actualResult: "页面白屏",
						id: "s2",
						position: 2,
						step: "s2 的操作",
					},
					{ actualResult: null, id: "s3", position: 3, step: "s3 的操作" },
				],
			],
			[
				"退款",
				"failed",
				[{ actualResult: null, id: "r1", position: 1, step: "r1 的操作" }],
			],
			[
				"沙箱支付",
				"blocked",
				[
					{
						actualResult: "沙箱账号没开通",
						id: "b1",
						position: 1,
						step: "b1 的操作",
					},
				],
			],
		]);
	});

	it("returns all attachments of each failed or blocked case in upload order, and none of other cases", async () => {
		const cases = await loadFailedAndBlockedCases(RUN);
		expect(
			cases.map((item) =>
				item.attachments.map(({ fileName, stepId }) => [fileName, stepId])
			)
		).toEqual([
			[
				["白屏.png", "s2"],
				["自动化.log", null],
				["已删除步骤.mp4", "s9"],
			],
			[],
			[["沙箱报错.png", "b1"]],
		]);
	});

	it("returns no cases for a run without failed or blocked cases", async () => {
		expect(await loadFailedAndBlockedCases(EMPTY_RUN)).toEqual([]);
	});
});
