import {
	getAuthSettingsRow,
	getAuthSettingsUpdatedAt,
} from "@automationstack/db/repositories/auth-settings-repository";

import { settingsFromEnv, settingsFromRow } from "./effective-settings";
import type { EffectiveAuthSettings } from "./settings-model";

const ONE_SECOND_MS = 1000;
const RECHECK_INTERVAL_SECONDS = 30;

/**
 * 缓存每 30 秒查一次 updated_at。保存成功后缓存立即失效（plan 021 §10.4）。
 * 这个检查用于以后有多个副本的情况：其他副本保存后，本副本最多 30 秒后读到新值。
 */
export const RECHECK_INTERVAL_MS = RECHECK_INTERVAL_SECONDS * ONE_SECOND_MS;

interface CacheEntry {
	checkedAt: number;
	settings: EffectiveAuthSettings;
}

let cache: CacheEntry | null = null;
let pending: Promise<EffectiveAuthSettings> | null = null;
let generation = 0;

async function loadSettings(): Promise<EffectiveAuthSettings> {
	const row = await getAuthSettingsRow();
	return row === null ? settingsFromEnv() : await settingsFromRow(row);
}

function startLoad(): Promise<EffectiveAuthSettings> {
	const startedAt = generation;
	const loading = loadSettings().then((settings) => {
		// 读取期间缓存失效过：不写入缓存，下一次调用重新读取。
		if (generation === startedAt) {
			cache = { checkedAt: Date.now(), settings };
		}
		return settings;
	});
	pending = loading;
	const clearPending = () => {
		if (pending === loading) {
			pending = null;
		}
	};
	loading.then(clearPending, clearPending);
	return loading;
}

function sameInstant(left: Date | null, right: Date | null): boolean {
	return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

async function isStillCurrent(entry: CacheEntry): Promise<boolean> {
	// 先更新检查时间，防止同时到达的请求都去查数据库。
	entry.checkedAt = Date.now();
	const updatedAt = await getAuthSettingsUpdatedAt();
	return sameInstant(updatedAt, entry.settings.updatedAt);
}

/** 当前生效的认证设置。登录、auth.config 和认证设置页面都从这里读取。 */
export async function getEffectiveAuthSettings(): Promise<EffectiveAuthSettings> {
	const entry = cache;
	if (entry === null) {
		return await (pending ?? startLoad());
	}
	if (Date.now() - entry.checkedAt < RECHECK_INTERVAL_MS) {
		return entry.settings;
	}
	if (await isStillCurrent(entry)) {
		return entry.settings;
	}
	if (cache === entry) {
		cache = null;
	}
	return await (pending ?? startLoad());
}

/** 保存认证设置成功后调用。下一次读取直接查数据库。 */
export function invalidateAuthSettingsCache(): void {
	generation += 1;
	cache = null;
	pending = null;
}
