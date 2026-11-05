import {
	getStorageSettingsRow,
	getStorageSettingsUpdatedAt,
} from "@automationstack/db/repositories/storage-settings-repository";

import {
	storageSettingsFromEnv,
	storageSettingsFromRow,
} from "./effective-settings";
import type { EffectiveStorageSettings } from "./settings-model";

const ONE_SECOND_MS = 1000;
const RECHECK_INTERVAL_SECONDS = 30;

/**
 * 缓存每 30 秒查一次 updated_at。保存成功后缓存立即失效。
 * 有多个 server 实例时，其他实例保存后，本实例最多 30 秒后读到新值。
 */
export const STORAGE_RECHECK_INTERVAL_MS =
	RECHECK_INTERVAL_SECONDS * ONE_SECOND_MS;

interface CacheEntry {
	checkedAt: number;
	settings: EffectiveStorageSettings;
}

let cache: CacheEntry | null = null;
let generation = 0;

async function loadSettings(): Promise<EffectiveStorageSettings> {
	const row = await getStorageSettingsRow();
	return row === null
		? storageSettingsFromEnv()
		: await storageSettingsFromRow(row);
}

async function isStillCurrent(entry: CacheEntry): Promise<boolean> {
	// 先更新检查时间，防止同时到达的请求都去查数据库。
	entry.checkedAt = Date.now();
	const updatedAt = await getStorageSettingsUpdatedAt();
	return (
		(updatedAt?.getTime() ?? null) ===
		(entry.settings.updatedAt?.getTime() ?? null)
	);
}

/** 当前生效的存储设置。上传、下载和存储设置页面都从这里读取。 */
export async function getEffectiveStorageSettings(): Promise<EffectiveStorageSettings> {
	const entry = cache;
	if (entry !== null) {
		if (Date.now() - entry.checkedAt < STORAGE_RECHECK_INTERVAL_MS) {
			return entry.settings;
		}
		if (await isStillCurrent(entry)) {
			return entry.settings;
		}
	}
	const startedAt = generation;
	const settings = await loadSettings();
	// 读取期间缓存失效过：不写入缓存，下一次调用重新读取。
	if (generation === startedAt) {
		cache = { checkedAt: Date.now(), settings };
	}
	return settings;
}

/** 保存存储设置成功后调用。下一次读取直接查数据库。 */
export function invalidateStorageSettingsCache(): void {
	generation += 1;
	cache = null;
}
