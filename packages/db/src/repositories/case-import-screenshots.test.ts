import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateAll } from "../migration-harness";
import type { CaseStep } from "../schema/test-cases";
import type { NewCaseAttachmentRow } from "./case-attachments-repository";
import {
	type ImportCaseRow,
	type ImportOnDuplicate,
	importTestCases,
} from "./case-import-repository";

const pg = vi.hoisted(() => ({ client: null as PGlite | null }));

// 导入使用全局的 db。这里换成内存数据库（PGlite），执行仓库中的全部迁移
vi.mock("../index", async () => {
	const { PGlite: Client } = await import("@electric-sql/pglite");
	const { drizzle } = await import("drizzle-orm/pglite");
	const client = new Client();
	pg.client = client;
	return { db: drizzle({ client }) };
});

const PROJECT = "00000000-0000-4000-8000-000000000001";
const MODULE = "00000000-0000-4000-8000-000000000002";
const CASE = "00000000-0000-4000-8000-000000000003";
const OLD_ACTION = "00000000-0000-4000-8000-0000000000a0";
const OLD_EXPECTED = "00000000-0000-4000-8000-0000000000b0";
const NEW_SHOT = "00000000-0000-4000-8000-0000000000c0";
const SOURCE_REF = "xmind:登录#1";

const client = (): PGlite => {
	if (pg.client === null) {
		throw new Error("PGlite 没有创建");
	}
	return pg.client;
};

const STORED_STEPS: CaseStep[] = [
	{
		actionScreenshots: [OLD_ACTION],
		expected: "进入首页",
		expectedScreenshots: [OLD_EXPECTED],
		id: "s1",
		step: "登录",
	},
	{
		actionScreenshots: [OLD_ACTION],
		expected: "",
		expectedScreenshots: [OLD_EXPECTED],
		id: "s2",
		step: "退出",
	},
];

const attachment: NewCaseAttachmentRow = {
	contentType: "image/png",
	createdBy: null,
	fileName: "新.png",
	id: NEW_SHOT,
	sizeBytes: 10,
	storageKey: `test-cases/${PROJECT}/${CASE}/new.png`,
};

/** 一行导入：s1 的操作截图换成新上传，s2 不给截图字段。 */
function row(screenshotCaseId = CASE, sourceRef = SOURCE_REF): ImportCaseRow {
	return {
		index: 0,
		item: {
			moduleId: MODULE,
			name: "登录",
			sourceRef,
			steps: [
				{
					actionScreenshots: [NEW_SHOT],
					expected: "进入首页",
					id: "s1",
					step: "登录",
				},
				{ expected: "", id: "s2", step: "退出" },
			],
		},
		screenshots: { attachments: [attachment], caseId: screenshotCaseId },
	};
}

const runImport = (onDuplicate: ImportOnDuplicate, importRow = row()) =>
	importTestCases({
		actorName: "张三",
		onDuplicate,
		projectId: PROJECT,
		rows: [importRow],
	});

async function storedCase() {
	const { rows } = await client().query<{
		current_version: number;
		steps: CaseStep[];
	}>("SELECT steps, current_version FROM test_cases WHERE id = $1", [CASE]);
	const attachments = await client().query<{ id: string }>(
		"SELECT id FROM case_attachments WHERE case_id = $1",
		[CASE]
	);
	return { attachmentIds: attachments.rows.map((item) => item.id), ...rows[0] };
}

beforeAll(async () => {
	await migrateAll(client());
	await client().query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
		PROJECT,
	]);
	await client().query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '模块')",
		[MODULE, PROJECT]
	);
	await client().query(
		`INSERT INTO test_cases (id, project_id, module_id, name, source_ref, steps)
		VALUES ($1, $2, $3, '登录', $4, $5::jsonb)`,
		[CASE, PROJECT, MODULE, SOURCE_REF, JSON.stringify(STORED_STEPS)]
	);
}, 60_000);

afterAll(async () => {
	await client().close();
});

describe("importTestCases：导入时引用截图上传凭证", () => {
	it.each<[string, ImportOnDuplicate, ImportCaseRow, string]>([
		[
			"a new case",
			"overwrite",
			row(CASE, "xmind:新用例#1"),
			'这一行会新建用例，新用例不能引用截图上传凭证。先导入用例，再用 onDuplicate "overwrite" 和同一个 sourceRef 写入截图',
		],
		[
			"uploads of another case",
			"overwrite",
			row(MODULE),
			"截图上传凭证属于另一个用例，不属于 sourceRef 对应的用例",
		],
	])(
		"rejects %s and writes nothing",
		async (_name, onDuplicate, importRow, message) => {
			const result = await runImport(onDuplicate, importRow);
			expect(result.errors).toEqual([
				{
					index: 0,
					message,
					name: "登录",
					sourceRef: importRow.item.sourceRef,
				},
			]);
			expect(await storedCase()).toEqual({
				attachmentIds: [],
				current_version: 1,
				steps: STORED_STEPS,
			});
		}
	);

	it("skip leaves the case and its screenshots as they are and says that it wrote no screenshots", async () => {
		const result = await runImport("skip");
		expect(result.skipped).toEqual([
			expect.objectContaining({
				reason:
					'sourceRef 已存在，按 skip 策略跳过；没有写入截图，写入截图要用 onDuplicate "overwrite"',
			}),
		]);
		expect(await storedCase()).toMatchObject({
			attachmentIds: [],
			steps: STORED_STEPS,
		});
	});

	it("overwrite replaces the given group, keeps the groups that are not given and registers the upload once", async () => {
		const expected = {
			attachmentIds: [NEW_SHOT],
			current_version: 2,
			steps: [
				{ ...STORED_STEPS[0], actionScreenshots: [NEW_SHOT] },
				STORED_STEPS[1],
			],
		};
		const first = await runImport("overwrite");
		expect(first.created).toMatchObject([
			{ action: "overwritten", caseId: CASE, version: 2 },
		]);
		expect(await storedCase()).toEqual(expected);
		// 同一批再导入一次：内容相同，不记录新版本，附件不重复登记
		await runImport("overwrite");
		expect(await storedCase()).toEqual(expected);
	});
});
