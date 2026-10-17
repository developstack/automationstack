import type { PGlite } from "@electric-sql/pglite";

/** 测试用：迁移 0019（删除步骤截图）之前的数据。每个附件 id 的名称说明它被哪里引用。 */

const ref = (attachmentId: string) => `![](attachment:${attachmentId})`;

const PROJECT = "00000000-0000-4000-8000-000000000001";
const MODULE = "00000000-0000-4000-8000-000000000002";
const RUN = "00000000-0000-4000-8000-000000000003";
const CASE_ONE = "00000000-0000-4000-8000-000000000010";
const CASE_TWO = "00000000-0000-4000-8000-000000000011";

/** 被步骤截图引用的附件。 */
export const SHOT = {
	inExpectedText: "00000000-0000-4000-8000-000000000105",
	inOtherCaseText: "00000000-0000-4000-8000-000000000107",
	inPreconditions: "00000000-0000-4000-8000-000000000103",
	inRunComment: "00000000-0000-4000-8000-000000000108",
	inRunEventComment: "00000000-0000-4000-8000-000000000110",
	inStepText: "00000000-0000-4000-8000-000000000104",
	inVersionText: "00000000-0000-4000-8000-000000000106",
	/** 文字中只有裸的 id，或者没有 ![]() 的 attachment:<id>，这不是引用。 */
	mentionedWithoutRefSyntax: "00000000-0000-4000-8000-000000000109",
	onlyInCurrentStep: "00000000-0000-4000-8000-000000000101",
	onlyInOldVersion: "00000000-0000-4000-8000-000000000102",
} as const;

/** 没有被步骤截图引用的附件。 */
export const NOT_SHOT = {
	inlineOnly: "00000000-0000-4000-8000-000000000201",
	unreferenced: "00000000-0000-4000-8000-000000000202",
} as const;

export const storageKeyOf = (attachmentId: string) =>
	`test-cases/${PROJECT}/${CASE_ONE}/${attachmentId}.png`;

const CASE_ONE_STEPS = [
	{
		expected: "显示登录表单",
		id: "s1",
		screenshots: [
			SHOT.onlyInCurrentStep,
			SHOT.inPreconditions,
			SHOT.inOtherCaseText,
		],
		step: "打开登录页",
	},
	{
		expected: `看到首页 ${ref(SHOT.inExpectedText.toUpperCase())}`,
		id: "s2",
		screenshots: [
			SHOT.inStepText,
			SHOT.inExpectedText,
			SHOT.mentionedWithoutRefSyntax,
		],
		step: `点击登录 ${ref(SHOT.inStepText)}`,
	},
	{ expected: "", id: "s3", step: "没有截图字段的旧步骤" },
	{ expected: "", id: "s4", screenshots: [], step: "空的截图列表" },
];

const CASE_ONE_PRECONDITIONS = [
	`账号已注册 ${ref(SHOT.inPreconditions)}`,
	`参考 ${SHOT.mentionedWithoutRefSyntax}`,
	`attachment:${SHOT.mentionedWithoutRefSyntax}`,
].join("\n");

const CASE_ONE_OLD_SNAPSHOT = {
	caseType: "functional",
	maintainer: null,
	moduleId: MODULE,
	name: "登录",
	preconditions: `旧的前置条件 ${ref(SHOT.inVersionText)}`,
	priority: "P2",
	sourceRef: null,
	status: "draft",
	steps: [
		{
			expected: "",
			id: "s1",
			screenshots: [SHOT.onlyInOldVersion, SHOT.inVersionText],
			step: "打开登录页",
		},
	],
	tags: ["冒烟"],
};

const CASE_ONE_CURRENT_SNAPSHOT = {
	...CASE_ONE_OLD_SNAPSHOT,
	preconditions: CASE_ONE_PRECONDITIONS,
	steps: CASE_ONE_STEPS,
};

const CASE_TWO_STEPS = [
	{
		expected: "",
		id: "t1",
		screenshots: [SHOT.inRunComment, SHOT.inRunEventComment],
		step: `见 ${ref(SHOT.inOtherCaseText)}`,
	},
];

/** 第一个用例有两个版本：旧版本和当前版本。 */
const OLD_VERSION = 1;
const CURRENT_VERSION = 2;

async function insertCases(db: PGlite): Promise<void> {
	const insertCase = `INSERT INTO test_cases
		(id, project_id, module_id, name, preconditions, steps, tags, current_version, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, '["冒烟"]'::jsonb, $7, '2026-01-02T03:04:05Z')`;
	await db.query(insertCase, [
		CASE_ONE,
		PROJECT,
		MODULE,
		"登录",
		CASE_ONE_PRECONDITIONS,
		JSON.stringify(CASE_ONE_STEPS),
		CURRENT_VERSION,
	]);
	await db.query(insertCase, [
		CASE_TWO,
		PROJECT,
		MODULE,
		"退出",
		`退出前 ${ref(NOT_SHOT.inlineOnly)}`,
		JSON.stringify(CASE_TWO_STEPS),
		1,
	]);
	const insertVersion = `INSERT INTO case_versions (case_id, version, snapshot, change_note)
		VALUES ($1, $2, $3::jsonb, $4)`;
	await db.query(insertVersion, [
		CASE_ONE,
		OLD_VERSION,
		JSON.stringify(CASE_ONE_OLD_SNAPSHOT),
		"第一版",
	]);
	await db.query(insertVersion, [
		CASE_ONE,
		CURRENT_VERSION,
		JSON.stringify(CASE_ONE_CURRENT_SNAPSHOT),
		null,
	]);
}

async function insertAttachments(db: PGlite): Promise<void> {
	const ids = [...Object.values(SHOT), ...Object.values(NOT_SHOT)];
	await Promise.all(
		ids.map((attachmentId) =>
			db.query(
				`INSERT INTO case_attachments (id, case_id, content_type, file_name, size_bytes, storage_key)
				VALUES ($1, $2, 'image/png', 'shot.png', 100, $3)`,
				[attachmentId, CASE_ONE, storageKeyOf(attachmentId)]
			)
		)
	);
}

export async function seedStepScreenshotFixtures(db: PGlite): Promise<void> {
	await db.query("INSERT INTO projects (id, name) VALUES ($1, '项目')", [
		PROJECT,
	]);
	await db.query(
		"INSERT INTO modules (id, project_id, name) VALUES ($1, $2, '登录模块')",
		[MODULE, PROJECT]
	);
	await insertCases(db);
	await insertAttachments(db);
	await db.query(
		"INSERT INTO test_runs (id, project_id, name) VALUES ($1, $2, '回归')",
		[RUN, PROJECT]
	);
	const runCase = await db.query<{ id: string }>(
		`INSERT INTO test_run_cases (run_id, case_id, comment, step_results)
		VALUES ($1, $2, $3, '[{"stepId":"t1","result":"failed","comment":"见截图"}]'::jsonb)
		RETURNING id`,
		[RUN, CASE_TWO, `实际结果 ${ref(SHOT.inRunComment)}`]
	);
	await db.query(
		`INSERT INTO test_run_case_events (run_case_id, from_result, to_result, comment)
		VALUES ($1, 'untested', 'failed', $2)`,
		[runCase.rows[0]?.id, `旧的结论 ${ref(SHOT.inRunEventComment)}`]
	);
}
