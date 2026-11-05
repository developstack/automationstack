import type { StorageBackendId } from "@automationstack/db/schema/storage-settings";

import type { AuthCredentialProblem } from "../auth/settings-model";
import { isSecretStorageAvailable } from "../auth/settings-secrets";
import { usernameOf } from "../auth/settings-view";
import { localStorageRoot } from "../lib/local-storage";
import {
	type EffectiveStorageSettings,
	r2ConnectionOf,
	type StorageSettingsSource,
} from "./settings-model";

/** 存储设置页面的数据。不包含密钥的值，只说明密钥是否已设置。 */
export interface StorageSettingsView {
	/** 新上传的文件实际写到哪里。存储方式是 R2 但 R2 不能使用时，这里是 local。 */
	activeBackend: StorageBackendId;
	backend: StorageBackendId;
	credentialProblem: AuthCredentialProblem | null;
	hasSecretAccessKey: boolean;
	/** server 上本地存储的目录（环境变量 FILE_STORAGE_DIR）。页面不能修改。 */
	localDirectory: string;
	publicBaseUrl: string | null;
	r2AccessKeyId: string | null;
	r2Bucket: string | null;
	r2Endpoint: string | null;
	secretStorageAvailable: boolean;
	source: StorageSettingsSource;
	updatedAt: Date | null;
	updatedByUsername: string | null;
}

export function activeBackendOf(
	settings: EffectiveStorageSettings
): StorageBackendId {
	return settings.backend === "r2" && r2ConnectionOf(settings.r2) !== null
		? "r2"
		: "local";
}

export async function toStorageSettingsView(
	settings: EffectiveStorageSettings
): Promise<StorageSettingsView> {
	return {
		activeBackend: activeBackendOf(settings),
		backend: settings.backend,
		credentialProblem: settings.credentialProblem,
		hasSecretAccessKey: settings.r2.secretAccessKey.present,
		localDirectory: localStorageRoot(),
		publicBaseUrl: settings.r2.publicBaseUrl,
		r2AccessKeyId: settings.r2.accessKeyId,
		r2Bucket: settings.r2.bucket,
		r2Endpoint: settings.r2.endpoint,
		secretStorageAvailable: isSecretStorageAvailable(),
		source: settings.source,
		updatedAt: settings.updatedAt,
		updatedByUsername: await usernameOf(settings.updatedBy),
	};
}
