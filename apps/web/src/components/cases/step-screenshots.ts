import { MAX_STEP_SCREENSHOTS } from "@automationstack/api/schemas/case";
import type { CaseStep } from "@automationstack/db/schema/test-cases";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";

/** 保存时同时上传的步骤截图数量。 */
export const SCREENSHOT_UPLOAD_CONCURRENCY = 3;

/** 「+」按钮的文件选择只接受这些类型。 */
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp";

/** 还没有上传的步骤截图使用这个前缀的本地 id。上传成功后保存时换成附件 id。 */
const LOCAL_SCREENSHOT_PREFIX = "local:";

export function newLocalScreenshotId(): string {
	return `${LOCAL_SCREENSHOT_PREFIX}${crypto.randomUUID()}`;
}

export function isLocalScreenshot(id: string): boolean {
	return id.startsWith(LOCAL_SCREENSHOT_PREFIX);
}

export function stepScreenshots(step: Pick<CaseStep, "screenshots">): string[] {
	return step.screenshots ?? [];
}

export interface ScreenshotAddPlan {
	accepted: File[];
	/** 说明被拒绝的文件和原因。所有文件都被接受时为 null。 */
	error: string | null;
}

/** 浏览器端先检查类型、大小和数量。existing 是这个步骤已有的截图数量。 */
export function planScreenshotAdd(
	files: readonly File[],
	existing: number
): ScreenshotAddPlan {
	const accepted: File[] = [];
	const reasons: string[] = [];
	let overLimit = 0;
	for (const file of files) {
		const precheck = precheckCaseImage(file);
		if (!precheck.ok) {
			reasons.push(`${file.name || "图片"}：${precheck.reason}`);
		} else if (existing + accepted.length >= MAX_STEP_SCREENSHOTS) {
			overLimit += 1;
		} else {
			accepted.push(file);
		}
	}
	if (overLimit > 0) {
		reasons.push(
			`每个步骤最多 ${MAX_STEP_SCREENSHOTS} 张截图，${overLimit} 张没有加入`
		);
	}
	return { accepted, error: reasons.length === 0 ? null : reasons.join("；") };
}

/** 步骤中还没有上传的本地截图 id，按编辑区的顺序。 */
export function localScreenshotIds(steps: readonly CaseStep[]): string[] {
	return steps.flatMap((step) =>
		stepScreenshots(step).filter(isLocalScreenshot)
	);
}

/** 把步骤中的本地截图 id 换成上传后的附件 id，顺序不变。 */
export function resolveStepScreenshots(
	steps: readonly CaseStep[],
	uploaded: ReadonlyMap<string, string>
): CaseStep[] {
	return steps.map((step) => {
		if (step.screenshots === undefined) {
			return step;
		}
		const screenshots = step.screenshots.map((id) => {
			if (!isLocalScreenshot(id)) {
				return id;
			}
			const attachmentId = uploaded.get(id);
			if (attachmentId === undefined) {
				throw new Error(`步骤截图 ${id} 还没有上传`);
			}
			return attachmentId;
		});
		return { ...step, screenshots };
	});
}

/** 从一个步骤中删除一张截图，返回新的步骤列表。其他步骤和截图的顺序不变。 */
export function withoutStepScreenshot(
	steps: readonly CaseStep[],
	stepId: string,
	attachmentId: string
): CaseStep[] {
	return steps.map((step) =>
		step.id === stepId
			? {
					...step,
					screenshots: stepScreenshots(step).filter(
						(id) => id !== attachmentId
					),
				}
			: step
	);
}

/** 依次处理 items，同时运行的 worker 不超过 limit 个。结果的顺序与 items 相同。 */
export async function runWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function lane(): Promise<void> {
		if (next >= items.length) {
			return;
		}
		const index = next;
		next += 1;
		results[index] = await worker(items[index] as T);
		await lane();
	}
	const lanes = Array.from({ length: Math.min(limit, items.length) }, () =>
		lane()
	);
	await Promise.all(lanes);
	return results;
}
