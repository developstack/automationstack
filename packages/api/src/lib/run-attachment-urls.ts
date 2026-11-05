import type { TestRunAttachment } from "@automationstack/db/schema/test-run-attachments";

import type { ObjectStorage } from "./object-storage-model";

/** 测试任务的一个附件和它的下载地址。没有存储时地址为 null。 */
export interface TestRunAttachmentView {
	attachment: TestRunAttachment;
	url: string | null;
}

/** 给测试任务的附件签发有过期时间的下载地址。执行页的附件列表和报告都用这个函数。 */
export async function withDownloadUrls(
	attachments: readonly TestRunAttachment[],
	storage: Pick<ObjectStorage, "presignDownload"> | null
): Promise<TestRunAttachmentView[]> {
	if (storage === null) {
		return attachments.map((attachment) => ({ attachment, url: null }));
	}
	return await Promise.all(
		attachments.map(async (attachment) => ({
			attachment,
			url: await storage.presignDownload(attachment.storageKey),
		}))
	);
}
