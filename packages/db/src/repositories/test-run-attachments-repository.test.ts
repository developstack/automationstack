import type { PGlite } from "@electric-sql/pglite";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { migrateAll } from "../migration-harness";
import {
	listAttachments,
	prepareAttachmentUpload,
	type RegisterStepAttachmentInput,
	registerAttachment,
	registerStepAttachment,
	removeAttachment,
} from "./test-run-attachments-repository";
import { MAX_STEP_ATTACHMENTS } from "./test-run-step-attachments-core";

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

const PROJECT = "30000000-0000-4000-8000-000000000001";
const MODULE = "30000000-0000-4000-8000-000000000002";
const CASE = "30000000-0000-4000-8000-000000000003";
const RUN = "30000000-0000-4000-8000-000000000004";
const RUN_CASE = "30000000-0000-4000-8000-000000000005";

const CASE_STEPS = ["s1", "s2"].map((id) => ({
	expected: `${id} 的预期`,
	id,
	step: `${id} 的操作`,
}));

function memoryDb(): PGlite {
	if (memory.client === null) {
		throw new Error("内存数据库还没有创建");
	}
	return memory.client;
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
		`INSERT INTO test_cases (id, project_id, module_id, name, steps)
		VALUES ($1, $2, $3, '下单支付', $4::jsonb)`,
		[CASE, PROJECT, MODULE, JSON.stringify(CASE_STEPS)]
	);
	await db.query(
		"INSERT INTO test_runs (id, project_id, name, status) VALUES ($1, $2, '回归', 'in_progress')",
		[RUN, PROJECT]
	);
	await db.query(
		"INSERT INTO test_run_cases (id, run_id, case_id) VALUES ($1, $2, $3)",
		[RUN_CASE, RUN, CASE]
	);
}

let uploads = 0;

/** 一次登记的输入：默认是第 s1 步的一张截图。storageKey 每次不同。 */
function upload(
	overrides: Partial<RegisterStepAttachmentInput> = {}
): RegisterStepAttachmentInput {
	uploads += 1;
	return {
		contentType: "image/png",
		createdBy: null,
		fileName: `shot-${uploads}.png`,
		isStorageKeyOwned: () => true,
		kind: "screenshot",
		runCaseId: RUN_CASE,
		sizeBytes: 1024,
		stepId: "s1",
		storageKey: `test-runs/${PROJECT}/${RUN}/${RUN_CASE}/screenshot-${uploads}.png`,
		...overrides,
	};
}

const register = (overrides: Partial<RegisterStepAttachmentInput> = {}) =>
	registerStepAttachment(upload(overrides));

/** 自动化上传：挂在整条用例上，没有步骤。 */
const registerCaseLevel = () =>
	registerAttachment({ ...upload(), uploadedVia: "automation" });

/** 测试任务的写锁：已提交（submitted）、已作废（voided）或可写（in_progress）。 */
async function setRunStatus(status: "in_progress" | "submitted" | "voided") {
	await memoryDb().query(
		`UPDATE test_runs SET status = $2::test_run_status,
			submitted_at = CASE WHEN $2::text = 'submitted' THEN now() END,
			voided_at = CASE WHEN $2::text = 'voided' THEN now() END
		WHERE id = $1`,
		[RUN, status]
	);
}

describe("测试任务的附件：实际附件挂在步骤上，自动化附件挂在整条用例上", () => {
	beforeAll(async () => {
		await migrateAll(memoryDb());
		await seed(memoryDb());
	}, 60_000);

	beforeEach(async () => {
		await setRunStatus("in_progress");
		await memoryDb().query("DELETE FROM test_run_attachments");
	});

	afterAll(async () => {
		await memoryDb().close();
	});

	it("lists the actual attachments of a step in upload order, with the step id", async () => {
		const names: string[] = [];
		for (const stepId of ["s1", "s2", "s1"]) {
			// biome-ignore lint/performance/noAwaitInLoops: 上传顺序就是要验证的顺序
			const result = await register({ stepId });
			if (result.kind === "registered") {
				names.push(result.attachment.fileName);
			}
		}
		const listed = await listAttachments(RUN_CASE);
		expect(listed.map((row) => [row.fileName, row.stepId])).toEqual([
			[names[0], "s1"],
			[names[1], "s2"],
			[names[2], "s1"],
		]);
	});

	it("registers an automation upload without a step on the whole case, as before", async () => {
		expect(await registerCaseLevel()).toMatchObject({
			attachment: { stepId: null, uploadedVia: "automation" },
			kind: "registered",
			scope: { projectId: PROJECT, runCaseId: RUN_CASE, runId: RUN },
		});
	});

	it.each([
		["prepare", (stepId: string) => prepareAttachmentUpload(RUN_CASE, stepId)],
		["register", (stepId: string) => register({ stepId })],
	])(
		"%s rejects a step that is not a step of this case",
		async (_name, write) => {
			expect(await write("s9")).toEqual({ kind: "unknown-step" });
			expect(await listAttachments(RUN_CASE)).toEqual([]);
		}
	);

	it.each([
		["prepare", () => prepareAttachmentUpload(RUN_CASE, "s1")],
		["register", () => register()],
	])(
		"%s rejects the attachment after the maximum number on one step, and other steps stay open",
		async (_name, write) => {
			for (let index = 0; index < MAX_STEP_ATTACHMENTS; index += 1) {
				// biome-ignore lint/performance/noAwaitInLoops: 串行填满一个步骤
				await register();
			}
			expect(await write()).toEqual({
				kind: "step-attachment-limit",
				max: MAX_STEP_ATTACHMENTS,
			});
			expect((await register({ stepId: "s2" })).kind).toBe("registered");
			expect(await listAttachments(RUN_CASE)).toHaveLength(
				MAX_STEP_ATTACHMENTS + 1
			);
		}
	);

	it("rejects a second register of a file that is already registered", async () => {
		const first = upload();
		await registerAttachment({ ...first, uploadedVia: "automation" });
		expect(await registerStepAttachment(first)).toEqual({
			kind: "invalid-storage-key",
		});
		expect(await listAttachments(RUN_CASE)).toHaveLength(1);
	});

	it("removes one actual attachment and keeps the others", async () => {
		const first = await register();
		await register();
		const id = first.kind === "registered" ? first.attachment.id : "";
		expect(await removeAttachment(id)).toMatchObject({
			attachment: { id, stepId: "s1" },
			kind: "removed",
			scope: { runId: RUN },
		});
		expect(await listAttachments(RUN_CASE)).toHaveLength(1);
	});

	it("keeps an attachment of the whole case read-only: it cannot be removed", async () => {
		const caseLevel = await registerCaseLevel();
		const id = caseLevel.kind === "registered" ? caseLevel.attachment.id : "";
		expect(await removeAttachment(id)).toEqual({ kind: "read-only" });
		expect(await listAttachments(RUN_CASE)).toHaveLength(1);
	});

	it.each([
		["submitted", "locked"],
		["voided", "voided"],
	] as const)(
		"rejects uploads and removals when the run is %s",
		async (status, kind) => {
			const existing = await register();
			const id = existing.kind === "registered" ? existing.attachment.id : "";
			await setRunStatus(status);
			expect((await prepareAttachmentUpload(RUN_CASE, "s1")).kind).toBe(kind);
			expect((await register()).kind).toBe(kind);
			expect((await removeAttachment(id)).kind).toBe(kind);
			expect(await listAttachments(RUN_CASE)).toHaveLength(1);
		}
	);
});
