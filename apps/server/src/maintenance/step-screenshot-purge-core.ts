import type { QueuedStepScreenshot } from "@automationstack/db/repositories/step-screenshot-purge-repository";

export const STEP_SCREENSHOT_PURGE_USAGE =
	"用法：tsx scripts/purge-step-screenshots.ts [--apply]。不带 --apply 时只列出对象，不删除。";

const APPLY_FLAG = "--apply";

export type StepScreenshotPurgeMode = "apply" | "dry-run";

export interface StepScreenshotPurgeDeps {
	/** 删除 step_screenshot_purge 中的一行。 */
	dequeue: (attachmentId: string) => Promise<void>;
	/** 返回 keys 中仍有 case_attachments 行使用的对象键。 */
	findKeysInUse: (keys: readonly string[]) => Promise<ReadonlySet<string>>;
	listQueued: () => Promise<QueuedStepScreenshot[]>;
	log: (message: string) => void;
	/** 删除一个 R2 对象。附件存储（R2）没有配置时为 null。 */
	removeObject: ((storageKey: string) => Promise<void>) | null;
	warn: (message: string) => void;
}

export interface StepScreenshotPurgeReport {
	deleted: number;
	failed: number;
	listed: number;
	mode: StepScreenshotPurgeMode;
	skipped: number;
}

export type StepScreenshotPurgeResult =
	| { kind: "done"; report: StepScreenshotPurgeReport }
	| { kind: "error"; message: string };

function parseMode(args: readonly string[]): StepScreenshotPurgeMode | null {
	if (args.length === 0) {
		return "dry-run";
	}
	if (args.length === 1 && args[0] === APPLY_FLAG) {
		return "apply";
	}
	return null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type ItemOutcome = "deleted" | "failed" | "listed" | "skipped";

/**
 * 处理清理队列中的一个对象：仍在使用时跳过；removeObject 为 null（dry run）时只列出；
 * 否则删除对象并移除这一行。
 */
async function handleItem(
	item: QueuedStepScreenshot,
	inUse: ReadonlySet<string>,
	removeObject: ((storageKey: string) => Promise<void>) | null,
	deps: StepScreenshotPurgeDeps
): Promise<ItemOutcome> {
	if (inUse.has(item.storageKey)) {
		deps.warn(`跳过 ${item.storageKey}：仍有附件记录使用这个对象键。`);
		return "skipped";
	}
	if (removeObject === null) {
		deps.log(item.storageKey);
		return "listed";
	}
	try {
		await removeObject(item.storageKey);
		await deps.dequeue(item.attachmentId);
		deps.log(`已删除 ${item.storageKey}`);
		return "deleted";
	} catch (error) {
		deps.warn(`删除失败 ${item.storageKey}：${errorMessage(error)}`);
		return "failed";
	}
}

function summary(report: StepScreenshotPurgeReport): string {
	const counts = `列出 ${report.listed}，删除 ${report.deleted}，失败 ${report.failed}，跳过 ${report.skipped}。`;
	return report.mode === "apply"
		? `完成：${counts}`
		: `只列出，没有删除：${counts}要删除这些对象，加上 ${APPLY_FLAG} 再执行一次。`;
}

/**
 * R2 清理脚本的逻辑（#74，ADR 0005）。只处理 step_screenshot_purge 中的对象键。
 * 默认只列出对象。带 --apply 时删除对象，删除成功后移除对应的行，所以中断后可以再次执行。
 * 仍有 case_attachments 行使用的对象键不删除，也不移除。
 */
export async function runStepScreenshotPurge(
	args: readonly string[],
	deps: StepScreenshotPurgeDeps
): Promise<StepScreenshotPurgeResult> {
	const mode = parseMode(args);
	if (mode === null) {
		return { kind: "error", message: STEP_SCREENSHOT_PURGE_USAGE };
	}
	const { removeObject } = deps;
	if (mode === "apply" && removeObject === null) {
		return { kind: "error", message: "附件存储（R2）没有配置，不能删除对象。" };
	}
	const items = await deps.listQueued();
	const report: StepScreenshotPurgeReport = {
		deleted: 0,
		failed: 0,
		listed: items.length,
		mode,
		skipped: 0,
	};
	if (items.length === 0) {
		deps.log("没有要删除的对象。");
		return { kind: "done", report };
	}
	const inUse = await deps.findKeysInUse(items.map((item) => item.storageKey));
	// dry run 时不传入删除函数，所以 handleItem 只列出对象
	const remove = mode === "apply" ? removeObject : null;
	for (const item of items) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐个删除，输出按顺序，一个失败不影响其他对象
		const outcome = await handleItem(item, inUse, remove, deps);
		if (outcome !== "listed") {
			report[outcome] += 1;
		}
	}
	deps.log(summary(report));
	return { kind: "done", report };
}
