import { env, isR2Configured } from "@automationstack/env/server";

import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	createR2Client,
	headR2Object,
	presignR2Download,
	presignR2Upload,
	type R2UploadObject,
	removeR2Object,
} from "./r2-operations";

export type R2ObjectHead = AttachmentObjectHead;

export interface R2Storage extends AttachmentObjectStore {
	presignDownload: (storageKey: string) => Promise<string>;
	/** 签发上传地址。地址只接受这个类型和这个准确大小的文件。 */
	presignUpload: (
		storageKey: string,
		object: R2UploadObject
	) => Promise<string>;
}

let cachedStorage: R2Storage | null = null;

function resolveEndpoint(): string | null {
	if (env.R2_ENDPOINT) {
		return env.R2_ENDPOINT;
	}
	if (env.R2_ACCOUNT_ID) {
		return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
	}
	return null;
}

function createStorage(bucket: string, endpoint: string): R2Storage {
	const client = createR2Client(endpoint);
	return {
		headObject: (storageKey) => headR2Object(client, bucket, storageKey),
		presignDownload: (storageKey) =>
			presignR2Download(client, bucket, storageKey),
		presignUpload: (storageKey, object) =>
			presignR2Upload(client, bucket, storageKey, object),
		remove: (storageKey) => removeR2Object(client, bucket, storageKey),
	};
}

export function getR2Storage(): R2Storage | null {
	if (!isR2Configured()) {
		return null;
	}
	const endpoint = resolveEndpoint();
	const bucket = env.R2_BUCKET;
	if (!(endpoint && bucket)) {
		return null;
	}
	if (cachedStorage === null) {
		cachedStorage = createStorage(bucket, endpoint);
	}
	return cachedStorage;
}
