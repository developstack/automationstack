import type { StorageBackendId } from "@automationstack/db/schema/storage-settings";

import type { CredentialProblem, StoredSecret } from "../settings/secrets";

/** 配置来源：页面配置（数据库中有 storage_settings 行）或环境变量。 */
export type StorageSettingsSource = "database" | "env";

/** R2 的配置。字段可以不完整：页面可以只保存一部分，r2ConnectionOf 判断能否连接。 */
export interface R2Settings {
	accessKeyId: string | null;
	bucket: string | null;
	endpoint: string | null;
	/** 用例图片的公开基础地址（ADR-0003）。为 null 时，用例图片使用 R2 签名链接。 */
	publicBaseUrl: string | null;
	secretAccessKey: StoredSecret;
}

/** 当前生效的存储设置。只在服务端内存中使用，密钥是明文，不得返回前端。 */
export interface EffectiveStorageSettings {
	/** 新上传的文件写到哪里。已有的文件在哪里，由 object-storage 读取时判断。 */
	backend: StorageBackendId;
	credentialProblem: CredentialProblem | null;
	r2: R2Settings;
	source: StorageSettingsSource;
	updatedAt: Date | null;
	updatedBy: string | null;
}

/** 可以连接的 R2 配置：每个必需字段都有值。 */
export interface R2Connection {
	accessKeyId: string;
	bucket: string;
	endpoint: string;
	publicBaseUrl: string | null;
	secretAccessKey: string;
}

export function r2ConnectionOf(r2: R2Settings): R2Connection | null {
	const { accessKeyId, bucket, endpoint } = r2;
	const secretAccessKey = r2.secretAccessKey.value;
	if (!(accessKeyId && bucket && endpoint && secretAccessKey)) {
		return null;
	}
	return {
		accessKeyId,
		bucket,
		endpoint,
		publicBaseUrl: r2.publicBaseUrl,
		secretAccessKey,
	};
}
