import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { caseAttachments } from "../schema/case-attachments";
import { stepScreenshotPurge } from "../schema/step-screenshot-purge";

export interface QueuedStepScreenshot {
	attachmentId: string;
	storageKey: string;
}

/** 迁移 0019 删除的步骤截图附件，按附件 id 排序。 */
export function listQueuedStepScreenshots(): Promise<QueuedStepScreenshot[]> {
	return db
		.select({
			attachmentId: stepScreenshotPurge.attachmentId,
			storageKey: stepScreenshotPurge.storageKey,
		})
		.from(stepScreenshotPurge)
		.orderBy(asc(stepScreenshotPurge.attachmentId));
}

/** 返回 keys 中仍有 case_attachments 行使用的对象键。 */
export async function findCaseAttachmentKeysInUse(
	keys: readonly string[]
): Promise<Set<string>> {
	if (keys.length === 0) {
		return new Set();
	}
	const rows = await db
		.selectDistinct({ storageKey: caseAttachments.storageKey })
		.from(caseAttachments)
		.where(inArray(caseAttachments.storageKey, [...keys]));
	return new Set(rows.map((row) => row.storageKey));
}

export async function dequeueStepScreenshot(
	attachmentId: string
): Promise<void> {
	await db
		.delete(stepScreenshotPurge)
		.where(eq(stepScreenshotPurge.attachmentId, attachmentId));
}
