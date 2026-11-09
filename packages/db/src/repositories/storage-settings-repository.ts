import { eq } from "drizzle-orm";

import { db } from "../index";
import {
	type ChangedSettingsField,
	settingsChangeLog,
} from "../schema/settings-change-log";
import {
	STORAGE_SETTINGS_ROW_ID,
	type StorageBackendId,
	type StorageSettingsRow,
	storageSettings,
} from "../schema/storage-settings";

export const STORAGE_SETTINGS_KEY = "storage";

export async function getStorageSettingsRow(): Promise<StorageSettingsRow | null> {
	const [row] = await db
		.select()
		.from(storageSettings)
		.where(eq(storageSettings.id, STORAGE_SETTINGS_ROW_ID))
		.limit(1);
	return row ?? null;
}

/** 只读 updated_at。缓存用它判断数据库中的存储设置是否变化。 */
export async function getStorageSettingsUpdatedAt(): Promise<Date | null> {
	const [row] = await db
		.select({ updatedAt: storageSettings.updatedAt })
		.from(storageSettings)
		.where(eq(storageSettings.id, STORAGE_SETTINGS_ROW_ID))
		.limit(1);
	return row?.updatedAt ?? null;
}

/**
 * 密钥列的三种写法：undefined 表示保留原值，null 表示清空，字符串表示新密文。
 * 其他列总是写入。
 */
export interface SaveStorageSettingsInput {
	actorId: string;
	changedFields: ChangedSettingsField[];
	values: {
		backend: StorageBackendId;
		publicBaseUrl: string | null;
		r2AccessKeyId: string | null;
		r2Bucket: string | null;
		r2Endpoint: string | null;
		r2SecretAccessKeyCipher?: string | null;
	};
}

/** 保存存储设置，并在同一个事务中写一条修改记录。 */
export function saveStorageSettings(
	input: SaveStorageSettingsInput
): Promise<StorageSettingsRow> {
	const values = {
		...input.values,
		updatedAt: new Date(),
		updatedBy: input.actorId,
	};
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(storageSettings)
			.values({ ...values, id: STORAGE_SETTINGS_ROW_ID })
			.onConflictDoUpdate({ set: values, target: storageSettings.id })
			.returning();
		if (!row) {
			throw new Error("saveStorageSettings: upsert returned no row");
		}
		await tx.insert(settingsChangeLog).values({
			actorId: input.actorId,
			changedFields: input.changedFields,
			settingsKey: STORAGE_SETTINGS_KEY,
		});
		return row;
	});
}
