import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import { createTestCase } from "./case-mutations-repository";

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

const PROJECT = "50000000-0000-4000-8000-000000000001";
const MODULE = "50000000-0000-4000-8000-000000000002";

beforeAll(async () => {
	const db = memory.client;
	if (db === null) {
		throw new Error("内存数据库还没有创建");
	}
	await migrateAll(db);
	await db.query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
		PROJECT,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '登录')",
		[MODULE, PROJECT]
	);
}, 60_000);

describe("createTestCase：维护人", () => {
	it.each([
		{ expected: "alice", maintainer: undefined, name: "没有填维护人：创建者" },
		{ expected: "alice", maintainer: null, name: "维护人为 null：创建者" },
		{ expected: "bob", maintainer: "bob", name: "填了维护人：保留" },
	])("$name", async ({ expected, maintainer }) => {
		const result = await createTestCase({
			actorName: "alice",
			maintainer,
			moduleId: MODULE,
			name: "登录成功",
			projectId: PROJECT,
		});
		expect(result.kind).toBe("created");
		if (result.kind === "created") {
			expect(result.testCase.maintainer).toBe(expected);
			expect(result.version.snapshot.maintainer).toBe(expected);
		}
	});
});
