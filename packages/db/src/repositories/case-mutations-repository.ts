import { eq } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import type {
	CasePriority,
	CaseStatus,
	CaseStep,
	CaseType,
	CaseVersion,
	TestCase,
} from "../schema/test-cases";
import { testCases } from "../schema/test-cases";
import {
	insertCaseAttachmentsInTx,
	type NewCaseAttachmentRow,
} from "./case-attachments-repository";
import {
	type CaseContentPatch,
	insertCaseVersion,
	type WriteCaseMutationOptions,
	writeCaseMutation,
} from "./case-snapshot-core";
import type { CaseWriteResult, DbTransaction } from "./repository-types";
import { countCasesInModule, openCaseSlot } from "./test-cases-repository";

const CREATE_CHANGE_NOTE = "创建用例";

export interface CreateTestCaseInput {
	actorName: string | null;
	/**
	 * 与用例同事务落库的正文贴图（新建用例时贴的图）。
	 *
	 * **可选，且默认不传时这个函数逐字节等价于加这个字段之前**——AI 采纳 /
	 * 导入 / 脑图三条调用路径都不传，它们连一次多余的 SQL 都不会多发
	 * （空数组在 `insertCaseAttachmentsInTx` 里直接返回）。
	 *
	 * 每一行的 `contentType` / `sizeBytes` 必须已经由调用方用 `HeadObject`
	 * 从 bucket 里读回来核实过：**事务里不发网络请求**，所以这里没有任何
	 * 补救机会，收到什么就写什么。
	 */
	attachments?: NewCaseAttachmentRow[];
	caseType?: CaseType;
	/**
	 * 客户端预生成的主键；不传则沿用列上的 `defaultRandom()`。
	 *
	 * 只为「新建用例时贴图」而存在：图的 object key 是
	 * `test-cases/{projectId}/{caseId}/...`，key 本身就编码了归属，所以
	 * caseId 必须在**第一张图上传之前**就确定。让前端先 `crypto.randomUUID()`
	 * 生成它，换来的是数据库里不需要存在任何「草稿用例」行——版本历史干净地
	 * 从 v1 开始，也不需要一个清理没保存草稿的定时任务。
	 *
	 * 代价是主键从此可能撞（同一份 localStorage 草稿在两个标签页各点一次保存），
	 * 由 `createTestCase` 折算成 `duplicate-id` 这个业务分支，见那里的注释。
	 */
	id?: string;
	index?: number;
	maintainer?: string | null;
	moduleId: string;
	name: string;
	preconditions?: string | null;
	priority?: CasePriority;
	projectId: string;
	sourceRef?: string | null;
	status?: CaseStatus;
	steps?: CaseStep[];
	tags?: string[];
}

export interface CreatedTestCase {
	testCase: TestCase;
	version: CaseVersion;
}

/**
 * `invalid-module`：目标模块不存在或属于别的项目。
 * `duplicate-id`：调用方指定的 `input.id` 已经被占用（见 `createTestCase`）。
 */
export type CreateTestCaseResult =
	| { kind: "created"; testCase: TestCase; version: CaseVersion }
	| { kind: "duplicate-id" }
	| { kind: "invalid-module" };

/** True only when the module exists and belongs to the given project. */
async function moduleBelongsToProject(
	tx: DbTransaction,
	moduleId: string,
	projectId: string
): Promise<boolean> {
	const [targetModule] = await tx
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	return targetModule?.projectId === projectId;
}

function toCaseInsertValues(
	input: CreateTestCaseInput,
	sortOrder: number
): typeof testCases.$inferInsert {
	return {
		caseType: input.caseType,
		// `input.id` 为 undefined 时 drizzle 会把这一列编译成 `DEFAULT`，
		// 与根本不写这个键产生的 SQL 逐字节相同——所以无条件写在这里是安全的，
		// 不需要为「没传 id」的三条调用路径分出一个额外的对象形状。
		id: input.id,
		lastModifiedBy: input.actorName,
		maintainer: input.maintainer ?? null,
		moduleId: input.moduleId,
		name: input.name,
		preconditions: input.preconditions ?? null,
		priority: input.priority,
		projectId: input.projectId,
		sortOrder,
		sourceRef: input.sourceRef ?? null,
		status: input.status,
		steps: input.steps ?? [],
		tags: input.tags ?? [],
	};
}

/**
 * Inserts a test case and its v1 snapshot in the given transaction.
 * The target module must belong to `input.projectId` (typed failure
 * otherwise). The new case is appended to (or spliced into) its
 * module's sort group.
 */
export async function createTestCaseInTx(
	tx: DbTransaction,
	input: CreateTestCaseInput
): Promise<CreateTestCaseResult> {
	const owned = await moduleBelongsToProject(
		tx,
		input.moduleId,
		input.projectId
	);
	if (!owned) {
		return { kind: "invalid-module" };
	}
	const total = await countCasesInModule(tx, input.moduleId);
	const index = Math.min(Math.max(input.index ?? total, 0), total);
	if (index < total) {
		await openCaseSlot(tx, input.moduleId, index);
	}
	const [row] = await tx
		.insert(testCases)
		.values(toCaseInsertValues(input, index))
		.returning();
	if (!row) {
		throw new Error("createTestCase: insert returned no row");
	}
	const version = await insertCaseVersion(tx, {
		changeNote: CREATE_CHANGE_NOTE,
		row,
		savedBy: input.actorName,
	});
	// 必须在用例行插入之后：`case_attachments.case_id` 是外键。
	// 放在建版本之后而不是之前，是为了让上面那四步的既有顺序在 diff 里保持原样。
	await insertCaseAttachmentsInTx(tx, row.id, input.attachments ?? []);
	return { kind: "created", testCase: row, version };
}

/** Postgres `unique_violation`。 */
const UNIQUE_VIOLATION_CODE = "23505";

/**
 * `test_cases.id` 主键约束的名字（Postgres 对内联 PRIMARY KEY 的默认命名，
 * 见 `migrations/0000_keen_hairball.sql`）。
 *
 * 光看错误码不够：这张表上还有 `test_cases_project_id_source_ref_uq`，
 * 一条带重复 `sourceRef` 的导入撞的是那个索引。只认错误码会把它误报成
 * 「用例已存在」，让用户拿着一条完全不相干的提示去排查。
 */
const CASE_PKEY_CONSTRAINT = "test_cases_pkey";

function isDuplicateCaseId(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	return (
		"code" in error &&
		error.code === UNIQUE_VIOLATION_CODE &&
		"constraint" in error &&
		error.constraint === CASE_PKEY_CONSTRAINT
	);
}

/**
 * 建用例。指定了 `input.id` 且该 id 已被占用时返回 `duplicate-id`。
 *
 * 现实场景：用户在两个标签页打开了同一份 localStorage 草稿，各点了一次保存。
 * 第二次是一条**语义明确**的业务分支（这条用例已经建好了），不是服务端故障，
 * 所以折算成类型化结果，而不是让一个 Postgres 违约异常冒成 500。
 *
 * ⚠️ **只在调用方显式传了 id 时才折算**：不传 id 时主键来自 `defaultRandom()`，
 * 那种情况下撞主键说明是真的出事了（比如 uuid 生成被人换成了假实现），
 * 把它安静地包成业务结果只会让故障更难被发现。这也让另外三条调用路径的
 * 异常行为保持原样。
 *
 * try/catch 套在事务**外面**：语句一旦违约，这个事务在 Postgres 里就已经是
 * aborted 状态，在回调里接着做任何事都没有意义。
 */
export async function createTestCase(
	input: CreateTestCaseInput
): Promise<CreateTestCaseResult> {
	try {
		return await db.transaction((tx) => createTestCaseInTx(tx, input));
	} catch (error) {
		if (input.id !== undefined && isDuplicateCaseId(error)) {
			return { kind: "duplicate-id" };
		}
		throw error;
	}
}

export interface UpdateTestCaseInput {
	actorName: string | null;
	changeNote?: string | null;
	/** User edit path passes the version it loaded; omit for system writes. */
	expectedVersion?: number;
	id: string;
	patch: CaseContentPatch;
}

/**
 * Content update through the snapshot pipeline. Returns a typed conflict
 * result when `expectedVersion` no longer matches (optimistic lock).
 */
export function updateTestCase(
	input: UpdateTestCaseInput
): Promise<CaseWriteResult> {
	const options: WriteCaseMutationOptions = {
		actorName: input.actorName,
		caseId: input.id,
		changeNote: input.changeNote,
		expectedVersion: input.expectedVersion,
		patch: input.patch,
	};
	return db.transaction((tx) => writeCaseMutation(tx, options));
}
