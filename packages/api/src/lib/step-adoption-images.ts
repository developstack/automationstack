import type {
	CopiedCaseImage,
	StepAdoptionSource,
} from "@automationstack/db/repositories/test-run-step-adoption-repository";

import { MAX_COLUMN_SCREENSHOTS } from "../schemas/case";
import {
	buildCaseAttachmentStorageKey,
	validateCaseImageUpload,
} from "./case-attachment-policy";
import type { ObjectStorage } from "./object-storage-model";

export interface StepImageCopies {
	images: CopiedCaseImage[];
	/** 没有复制的实际附件数：录屏、日志、不支持的图片格式、超过大小上限或数量上限的图片，以及已经不在存储中的文件。 */
	skipped: number;
}

/** 删除复制的文件。设为预期结果失败时使用，所以删除失败时不再报错。 */
export async function removeCopiedImages(
	storage: ObjectStorage,
	images: readonly CopiedCaseImage[]
): Promise<void> {
	await Promise.allSettled(
		images.map((image) => storage.remove(image.storageKey))
	);
}

async function copyImage(
	storage: ObjectStorage,
	source: StepAdoptionSource,
	attachment: StepAdoptionSource["attachments"][number]
): Promise<CopiedCaseImage | null> {
	const body = await storage.readObject(attachment.storageKey);
	if (body === null) {
		return null;
	}
	const storageKey = buildCaseAttachmentStorageKey(source, attachment);
	await storage.writeObject(storageKey, body, attachment.contentType);
	return {
		contentType: attachment.contentType,
		fileName: attachment.fileName,
		sizeBytes: body.byteLength,
		storageKey,
	};
}

/**
 * 把一个步骤的实际附件中的图片复制到用例的目录，用作预期截图。只复制用例可以使用的图片
 * （类型和大小与上传用例图片的规则相同），最多复制一组预期截图的数量上限。
 * 有一张复制失败时，删除已经复制的文件，然后抛出错误。
 */
export async function copyStepImagesToCase(
	storage: ObjectStorage,
	source: StepAdoptionSource
): Promise<StepImageCopies> {
	const usable = source.attachments
		.filter((attachment) => validateCaseImageUpload(attachment).kind === "ok")
		.slice(0, MAX_COLUMN_SCREENSHOTS);
	const settled = await Promise.allSettled(
		usable.map((attachment) => copyImage(storage, source, attachment))
	);
	const images = settled.flatMap((outcome) =>
		outcome.status === "fulfilled" && outcome.value !== null
			? [outcome.value]
			: []
	);
	const failed = settled.find((outcome) => outcome.status === "rejected");
	if (failed !== undefined) {
		await removeCopiedImages(storage, images);
		throw failed.reason;
	}
	return { images, skipped: source.attachments.length - images.length };
}
