import type { EffectiveStorageSettings } from "../storage/settings-model";
import { r2ConnectionOf } from "../storage/settings-model";
import { getEffectiveStorageSettings } from "../storage/settings-store";
import { createLocalStorage, type LocalObjectStorage } from "./local-storage";
import type { ObjectStorage } from "./object-storage-model";
import { createR2Storage } from "./r2";

export type { ObjectStorage, UploadObject } from "./object-storage-model";

export interface StorageParts {
	local: LocalObjectStorage;
	/** R2 的配置完整时才有值。存储方式改为本地后，它仍然用于读取以前上传到 R2 的文件。 */
	r2: ObjectStorage | null;
	/** 新上传的文件写到这里。 */
	upload: ObjectStorage;
}

/**
 * 把本地存储和 R2 合成一个存储。新文件写到 upload。
 * 读取和删除时，本地目录中有这个对象就用本地，否则用 R2。
 * 所以切换存储方式后，以前上传的文件仍然可以查看和删除，不需要迁移。
 */
export function composeObjectStorage(parts: StorageParts): ObjectStorage {
	const { local, r2 } = parts;
	const holder = async (storageKey: string): Promise<ObjectStorage> => {
		if (r2 === null || (await local.has(storageKey))) {
			return local;
		}
		return r2;
	};
	return {
		caseImageUrl: async (storageKey) =>
			(await holder(storageKey)).caseImageUrl(storageKey),
		headObject: (storageKey) => parts.upload.headObject(storageKey),
		presignDownload: async (storageKey) =>
			(await holder(storageKey)).presignDownload(storageKey),
		presignUpload: (storageKey, object) =>
			parts.upload.presignUpload(storageKey, object),
		remove: async (storageKey) => (await holder(storageKey)).remove(storageKey),
	};
}

/**
 * 由存储设置得出各部分。存储方式是 r2 但 R2 的配置不完整（例如密钥不能解密）时，
 * 新文件写到本地，上传功能仍然可用。存储设置页面显示这个问题。
 */
export function storagePartsOf(
	settings: EffectiveStorageSettings,
	local: LocalObjectStorage = createLocalStorage()
): StorageParts {
	const connection = r2ConnectionOf(settings.r2);
	const r2 = connection === null ? null : createR2Storage(connection);
	const upload = settings.backend === "r2" && r2 !== null ? r2 : local;
	return { local, r2, upload };
}

let cached: {
	settings: EffectiveStorageSettings;
	storage: ObjectStorage;
} | null = null;

/** 当前的对象存储。存储设置变化后，下一次调用使用新的设置。 */
export async function getObjectStorage(): Promise<ObjectStorage> {
	const settings = await getEffectiveStorageSettings();
	if (cached?.settings !== settings) {
		cached = {
			settings,
			storage: composeObjectStorage(storagePartsOf(settings)),
		};
	}
	return cached.storage;
}
