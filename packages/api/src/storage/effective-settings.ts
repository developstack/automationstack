import type { StorageSettingsRow } from "@automationstack/db/schema/storage-settings";
import { env, isR2Configured } from "@automationstack/env/server";

import { NO_SECRET, openSecret } from "../settings/secrets";
import type { EffectiveStorageSettings } from "./settings-model";

function envEndpoint(): string | null {
	if (env.R2_ENDPOINT) {
		return env.R2_ENDPOINT;
	}
	if (env.R2_ACCOUNT_ID) {
		return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
	}
	return null;
}

/**
 * 数据库中没有 storage_settings 行时，存储设置取环境变量。
 * R2_* 完整时使用 R2，否则使用服务器本地存储。
 */
export function storageSettingsFromEnv(): EffectiveStorageSettings {
	const secret = env.R2_SECRET_ACCESS_KEY;
	return {
		backend: isR2Configured() ? "r2" : "local",
		credentialProblem: null,
		r2: {
			accessKeyId: env.R2_ACCESS_KEY_ID ?? null,
			bucket: env.R2_BUCKET ?? null,
			endpoint: envEndpoint(),
			publicBaseUrl: env.IMAGE_PUBLIC_BASE_URL ?? null,
			secretAccessKey:
				secret === undefined ? NO_SECRET : { present: true, value: secret },
		},
		source: "env",
		updatedAt: null,
		updatedBy: null,
	};
}

/** 数据库中有 storage_settings 行时，所有项都取这一行，不逐项回退到环境变量。 */
export async function storageSettingsFromRow(
	row: StorageSettingsRow
): Promise<EffectiveStorageSettings> {
	const secret = await openSecret(row.r2SecretAccessKeyCipher);
	return {
		backend: row.backend,
		credentialProblem: secret.problem,
		r2: {
			accessKeyId: row.r2AccessKeyId,
			bucket: row.r2Bucket,
			endpoint: row.r2Endpoint,
			publicBaseUrl: row.publicBaseUrl,
			secretAccessKey: secret.secret,
		},
		source: "database",
		updatedAt: row.updatedAt,
		updatedBy: row.updatedBy,
	};
}
