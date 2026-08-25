import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestAttachmentPresignItem,
	IngestAttachmentRegisterItem,
} from "./attachment-contract";

/**
 * 附件通道单测共用的构造器（`attachment-*.test.ts` 三个文件）。
 *
 * 单独成一个模块而不是各测试文件各留一份：仓库的 300 行上限对测试文件同样生效，
 * 折算的用例已经装不进一个文件，而 `targetRow` / `manyRows` 这类构造器一旦复制
 * 三份，改一处判据就要在三处同步——这正是测试最容易悄悄失真的地方。
 *
 * 这里不 import `vitest`：假的对象存储（`vi.fn()`）留在用到它的测试文件里，
 * 免得一个普通模块把测试运行器拖进生产依赖图。db 那条 import 依旧是
 * `import type`，编译期擦除。
 */

export const CASE_A = "11111111-1111-4111-8111-111111111111";
export const CASE_B = "22222222-2222-4222-8222-222222222222";
export const RUN_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
export const RUN_TWO = "bbbbbbbb-2222-4222-8222-222222222222";
export const RUN_CASE_ONE = "cccccccc-1111-4111-8111-111111111111";
export const RUN_CASE_TWO = "dddddddd-2222-4222-8222-222222222222";
export const MIB = 1024 * 1024;

export function screenshot(
	sourceRef: string,
	sizeBytes = 1024
): IngestAttachmentPresignItem {
	return { contentType: "image/png", kind: "screenshot", sizeBytes, sourceRef };
}

/** 用例存在、但没有任何未提交任务收它：LEFT JOIN 的右半边全 null。 */
export function orphanRow(
	caseId: string,
	sourceRef: string
): AutomationTargetRow {
	return {
		caseId,
		runCaseId: null,
		runId: null,
		runName: null,
		runStatus: null,
		sourceRef,
	};
}

export function targetRow(options: {
	caseId: string;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	status?: AutomationTargetRow["runStatus"];
}): AutomationTargetRow {
	return {
		caseId: options.caseId,
		runCaseId: options.runCaseId,
		runId: options.runId,
		runName: options.runName,
		runStatus: options.status ?? "in_progress",
		sourceRef: options.sourceRef,
	};
}

/** `count` 条各自独立的 run_case，全挂在同一个任务上——配额是按任务算的。 */
export function manyRows(count: number): AutomationTargetRow[] {
	return Array.from({ length: count }, (_unused, index) =>
		targetRow({
			caseId: CASE_A,
			runCaseId: `${RUN_CASE_ONE.slice(0, -3)}${String(index).padStart(3, "0")}`,
			runId: RUN_ONE,
			runName: "冒烟",
			sourceRef: `S${index}`,
		})
	);
}

export function registerItem(
	runId: string,
	runCaseId: string
): IngestAttachmentRegisterItem {
	return {
		fileName: "shot.png",
		kind: "screenshot",
		runCaseId,
		runId,
		storageKey: `test-runs/p/${runId}/${runCaseId}/screenshot-x.png`,
	};
}
