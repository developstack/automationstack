import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateAll } from "../migration-harness";
import {
	type WriteCaseMutationOptions,
	writeCaseMutation,
} from "./case-snapshot-core";
import type { DbTransaction } from "./repository-types";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const MODULE = "00000000-0000-4000-8000-000000000002";
const STEPS = [{ expected: "进入首页", id: "s1", step: "输入账号" }];

const client = new PGlite();
const orm = drizzle({ client });

let nextCase = 10;

async function insertCase(): Promise<string> {
	nextCase += 1;
	const id = `00000000-0000-4000-8000-${String(nextCase).padStart(12, "0")}`;
	await client.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '登录', $4::jsonb)`,
		[id, PROJECT, MODULE, JSON.stringify(STEPS)]
	);
	return id;
}

function write(options: Omit<WriteCaseMutationOptions, "actorName">) {
	return orm.transaction((tx) =>
		writeCaseMutation(tx as unknown as DbTransaction, {
			actorName: "张三",
			...options,
		})
	);
}

describe("writeCaseMutation：保存用例内容并记录版本", () => {
	beforeAll(async () => {
		await migrateAll(client);
		await client.query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
			PROJECT,
		]);
		await client.query(
			"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '模块')",
			[MODULE, PROJECT]
		);
	}, 60_000);

	afterAll(async () => {
		await client.close();
	});

	it("reports a missing case", async () => {
		const result = await write({ caseId: PROJECT, patch: { name: "新名称" } });
		expect(result).toEqual({ kind: "not-found" });
	});

	it("reports a conflict when the case has a newer version", async () => {
		const caseId = await insertCase();
		const result = await write({
			caseId,
			expectedVersion: 2,
			patch: { name: "新名称" },
		});
		expect(result).toEqual({
			currentVersion: 1,
			kind: "conflict",
			lastModifiedBy: null,
		});
	});

	it("does not write a patch that changes nothing", async () => {
		const caseId = await insertCase();
		const result = await write({
			caseId,
			patch: { name: "登录", steps: STEPS },
		});
		expect(result).toMatchObject({ kind: "unchanged" });
	});

	it("writes the patch, increments the version and records a snapshot", async () => {
		const caseId = await insertCase();
		const steps = [{ expected: "进入工作台", id: "s1", step: "输入账号" }];
		const result = await write({
			caseId,
			changeNote: "改预期",
			expectedVersion: 1,
			patch: { steps },
		});
		expect(result).toMatchObject({
			kind: "written",
			testCase: { currentVersion: 2, lastModifiedBy: "张三", steps },
			version: {
				changeNote: "改预期",
				savedBy: "张三",
				snapshot: { name: "登录", steps },
				version: 2,
			},
		});
	});
});
