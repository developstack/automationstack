import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateAll } from "../migration-harness";
import type { CaseStep } from "../schema/test-cases";
import {
	type WriteCaseMutationOptions,
	writeCaseMutation,
} from "./case-snapshot-core";
import type { DbTransaction } from "./repository-types";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const MODULE = "00000000-0000-4000-8000-000000000002";
const STEP: CaseStep = { expected: "进入首页", id: "s1", step: "输入账号" };
const STEPS = [STEP];
const SHOT_A = "00000000-0000-4000-8000-00000000000a";
const SHOT_B = "00000000-0000-4000-8000-00000000000b";
/** 带两组截图的步骤：操作截图 A，预期截图 B。 */
const STEPS_WITH_SCREENSHOTS = [
	{
		...STEP,
		actionScreenshots: [SHOT_A],
		expectedScreenshots: [SHOT_B],
	},
];

const client = new PGlite();
const orm = drizzle({ client });

let nextCase = 10;

async function insertCase(steps: unknown[] = STEPS): Promise<string> {
	nextCase += 1;
	const id = `00000000-0000-4000-8000-${String(nextCase).padStart(12, "0")}`;
	await client.query(
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '登录', $4::jsonb)`,
		[id, PROJECT, MODULE, JSON.stringify(steps)]
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

	it.each([
		[
			"keeps both screenshot groups of a step that keeps its id when the patch has no screenshot fields",
			[{ expected: "进入工作台", id: "s1", step: "输入账号" }],
			[
				{
					actionScreenshots: [SHOT_A],
					expected: "进入工作台",
					expectedScreenshots: [SHOT_B],
					id: "s1",
					step: "输入账号",
				},
			],
		],
		[
			"keeps only the group the patch omits",
			[{ ...STEP, actionScreenshots: [] }],
			[{ ...STEP, actionScreenshots: [], expectedScreenshots: [SHOT_B] }],
		],
		[
			"gives no screenshots to a step with a new id",
			[{ expected: "进入首页", id: "s2", step: "输入账号" }],
			[{ expected: "进入首页", id: "s2", step: "输入账号" }],
		],
	] as [string, CaseStep[], CaseStep[]][])(
		"%s",
		async (_name, patchSteps, storedSteps) => {
			const caseId = await insertCase(STEPS_WITH_SCREENSHOTS);
			const result = await write({ caseId, patch: { steps: patchSteps } });
			expect(result).toMatchObject({
				kind: "written",
				testCase: { steps: storedSteps },
				version: { snapshot: { steps: storedSteps } },
			});
		}
	);

	it("does not write a patch without screenshot fields when the text is the same", async () => {
		const caseId = await insertCase(STEPS_WITH_SCREENSHOTS);
		const result = await write({ caseId, patch: { steps: STEPS } });
		expect(result).toMatchObject({ kind: "unchanged" });
	});
});
