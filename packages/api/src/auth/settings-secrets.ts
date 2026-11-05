import { encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

import type { SecretUpdate } from "./settings-input";
import type { EffectiveAuthSettings, StoredSecret } from "./settings-model";

/** 主密钥是否已配置。没有主密钥时，页面不能填写密钥。 */
export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}

async function encryptWithMasterKey(value: string): Promise<string | null> {
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	if (!masterKey) {
		return null;
	}
	const encrypted = await encryptSecret(value, masterKey);
	return encrypted.kind === "ok" ? encrypted.box : null;
}

/**
 * 密钥列的新值：undefined 表示保留原值，null 表示清空，字符串表示新密文。
 * 不能加密时返回 master-key-missing。数据库中从不保存明文。
 */
export type SecretColumn =
	| { cipher: string | null | undefined; kind: "ok" }
	| { kind: "master-key-missing" };

async function encryptedColumn(value: string): Promise<SecretColumn> {
	const cipher = await encryptWithMasterKey(value);
	return cipher === null
		? { kind: "master-key-missing" }
		: { cipher, kind: "ok" };
}

export function secretColumnFor(
	update: SecretUpdate,
	current: Pick<EffectiveAuthSettings, "source">,
	currentSecret: StoredSecret
): Promise<SecretColumn> | SecretColumn {
	if (update.kind === "clear") {
		return { cipher: null, kind: "ok" };
	}
	if (update.kind === "set") {
		return encryptedColumn(update.value);
	}
	// 第一次保存时，数据库中还没有密文。「保留」指保留环境变量中的值，
	// 所以把它加密存入数据库；否则保存后这个密钥会消失。
	if (current.source === "env" && currentSecret.value !== null) {
		return encryptedColumn(currentSecret.value);
	}
	return { cipher: undefined, kind: "ok" };
}
