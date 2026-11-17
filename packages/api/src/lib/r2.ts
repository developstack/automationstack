import type { R2Connection } from "../storage/settings-model";
import { caseImageDownloadUrl } from "./case-image-url";
import type { ObjectStorage } from "./object-storage-model";
import {
	createR2Client,
	headR2Object,
	presignR2Download,
	presignR2Upload,
	putR2Object,
	readR2Object,
	removeR2Object,
} from "./r2-operations";

/** Cloudflare R2 中的对象存储。连接参数来自存储设置（页面配置或环境变量）。 */
export function createR2Storage(connection: R2Connection): ObjectStorage {
	const client = createR2Client(connection);
	const { bucket } = connection;
	const presignDownload = (storageKey: string) =>
		presignR2Download(client, bucket, storageKey);
	return {
		caseImageUrl: (storageKey) =>
			caseImageDownloadUrl(
				{ presignDownload },
				storageKey,
				connection.publicBaseUrl
			),
		headObject: (storageKey) => headR2Object(client, bucket, storageKey),
		presignDownload,
		presignUpload: (storageKey, object) =>
			presignR2Upload(client, bucket, storageKey, object),
		readObject: (storageKey) => readR2Object(client, bucket, storageKey),
		remove: (storageKey) => removeR2Object(client, bucket, storageKey),
		writeObject: (storageKey, body, contentType) =>
			putR2Object(client, bucket, storageKey, { body, contentType }),
	};
}
