import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { getActivityFeed } from "./project-stats-activity";
import {
	FEED_ITEM_LIMIT,
	FEED_PAGE_SIZE,
	parseFeedCursor,
	toFeedPage,
} from "./project-stats-activity-core";

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

const MODULE = "50000000-0000-4000-8000-000000000002";
const LIVE_CASE = "50000000-0000-4000-8000-000000000003";
const GONE_CASE = "50000000-0000-4000-8000-000000000004";

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
}

let projects = 0;

async function seedProject(): Promise<string> {
	projects += 1;
	const id = `50000000-0000-4000-8000-1000000000${String(projects).padStart(2, "0")}`;
	await memoryDb().query("INSERT INTO projects (id, name) VALUES ($1, 'p')", [
		id,
	]);
	return id;
}

interface ActivitySeed {
	action: "created" | "deleted" | "updated";
	actorName: string;
	at: string;
	caseId?: string;
	caseName: string;
	projectId: string;
}

async function seedActivity(row: ActivitySeed): Promise<void> {
	await memoryDb().query(
		`INSERT INTO case_activities (action, actor_name, case_id, case_name, module_id, project_id, version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 2, $7)`,
		[
			row.action,
			row.actorName,
			row.caseId ?? GONE_CASE,
			row.caseName,
			MODULE,
			row.projectId,
			row.at,
		]
	);
}

const KEEPS_MICROSECONDS = /123456$/;

/** 第 n 秒的时间，带微秒，用来检查游标不丢失微秒。 */
const second = (n: number) =>
	`2026-03-01T00:00:${String(n).padStart(2, "0")}.123456Z`;

beforeAll(async () => {
	await migrateAll(memoryDb());
	const projectId = await seedProject();
	await memoryDb().query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '支付')",
		[MODULE, projectId]
	);
	await memoryDb().query(
		"INSERT INTO test_cases (id, project_id, module_id, name) VALUES ($1, $2, $3, '还在')",
		[LIVE_CASE, projectId, MODULE]
	);
}, 60_000);

afterAll(async () => {
	await memoryDb().close();
});

describe("getActivityFeed", () => {
	it("merges one transaction of one user into one entry, and leaves out created cases", async () => {
		const projectId = await seedProject();
		const base = {
			action: "deleted",
			actorName: "alice",
			at: second(1),
			projectId,
		} as const;
		await seedActivity({ ...base, caseName: "乙" });
		await seedActivity({ ...base, caseName: "甲" });
		await seedActivity({ ...base, actorName: "bob", caseName: "丙" });
		await seedActivity({ ...base, action: "created", caseName: "新" });
		await seedActivity({
			...base,
			action: "updated",
			at: second(2),
			caseId: LIVE_CASE,
			caseName: "还在",
		});
		const page = await getActivityFeed(projectId);
		expect(
			page.entries.map((entry) => ({
				action: entry.action,
				actor: entry.actorName,
				cases: entry.cases.map((item) => [item.caseName, item.exists]),
			}))
		).toEqual([
			{ action: "updated", actor: "alice", cases: [["还在", true]] },
			{ action: "deleted", actor: "bob", cases: [["丙", false]] },
			{
				action: "deleted",
				actor: "alice",
				// 按用例名称排序：「乙」的码位小于「甲」
				cases: [
					["乙", false],
					["甲", false],
				],
			},
		]);
		expect(page.entries[0]?.cases[0]?.moduleName).toBe("支付");
		expect(page.nextCursor).toBeNull();
	});

	it("lists at most the item limit in one entry, and counts all cases", async () => {
		const projectId = await seedProject();
		const total = FEED_ITEM_LIMIT + 3;
		for (let index = 0; index < total; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
			await seedActivity({
				action: "updated",
				actorName: "alice",
				at: second(1),
				caseName: `用例 ${String(index).padStart(2, "0")}`,
				projectId,
			});
		}
		const [entry] = (await getActivityFeed(projectId)).entries;
		expect(entry?.caseCount).toBe(total);
		expect(entry?.cases).toHaveLength(FEED_ITEM_LIMIT);
	});

	it("pages with the cursor without losing or repeating an entry, also when two entries share a time", async () => {
		const projectId = await seedProject();
		const count = FEED_PAGE_SIZE + 2;
		for (let index = 0; index < count; index += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 测试数据按顺序写入
			await seedActivity({
				action: "updated",
				actorName: "alice",
				at: second(index),
				caseName: `a${index}`,
				projectId,
			});
		}
		// 与第一页最后一条日志同一个时间、但是另一个用户
		const boundary = count - FEED_PAGE_SIZE;
		await seedActivity({
			action: "updated",
			actorName: "aaron",
			at: second(boundary),
			caseName: "同一时间",
			projectId,
		});
		const first = await getActivityFeed(projectId);
		expect(first.entries).toHaveLength(FEED_PAGE_SIZE);
		expect(first.nextCursor).not.toBeNull();
		expect(parseFeedCursor(first.nextCursor ?? "")?.micros).toMatch(
			KEEPS_MICROSECONDS
		);
		const next = await getActivityFeed(projectId, first.nextCursor ?? "");
		const names = [...first.entries, ...next.entries].map(
			(entry) => entry.cases[0]?.caseName
		);
		expect(new Set(names).size).toBe(count + 1);
		expect(next.nextCursor).toBeNull();
	});

	it("ignores another project's activities", async () => {
		const [mine, other] = [await seedProject(), await seedProject()];
		await seedActivity({
			action: "deleted",
			actorName: "alice",
			at: second(1),
			caseName: "别人的",
			projectId: other,
		});
		expect((await getActivityFeed(mine)).entries).toEqual([]);
	});
});

describe("toFeedPage", () => {
	it("has no next cursor when there is no extra entry", () => {
		expect(toFeedPage([])).toEqual({ entries: [], nextCursor: null });
	});

	it.each(["", "abc", "12", "x|k", "|k"])(
		"parseFeedCursor(%j) is null",
		(value) => {
			expect(parseFeedCursor(value)).toBeNull();
		}
	);
});
