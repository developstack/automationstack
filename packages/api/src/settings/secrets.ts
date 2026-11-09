import { decryptSecret, encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

import type { SecretUpdate } from "./input";

/** 已保存的密钥不能解密的原因。 */
export type CredentialProblem = "master-key-missing" | "undecryptable";

/**
 * 一个密钥的状态。present 为 true 但 value 为 null，表示数据库中有密文，
 * 但现在不能解密（原因见 CredentialProblem）。
 */
export interface StoredSecret {
	present: boolean;
	value: string | null;
}

export const NO_SECRET: StoredSecret = { present: false, value: null };

/** 设置的来源：页面配置（数据库中有设置行）或环境变量。 */
export type SettingsSource = "database" | "env";

/** 主密钥是否已配置。没有主密钥时，页面不能填写密钥。 */
export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}

export interface OpenedSecret {
	problem: CredentialProblem | null;
	secret: StoredSecret;
}

/** 解密一个密钥列。 */
export async function openSecret(cipher: string | null): Promise<OpenedSecret> {
	if (cipher === null) {
		return { problem: null, secret: NO_SECRET };
	}
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	const unavailable = (problem: CredentialProblem): OpenedSecret => ({
		problem,
		secret: { present: true, value: null },
	});
	if (!masterKey) {
		return unavailable("master-key-missing");
	}
	const decrypted = await decryptSecret(cipher, masterKey);
	if (decrypted.kind === "invalid-key") {
		return unavailable("master-key-missing");
	}
	if (decrypted.kind !== "ok") {
		return unavailable("undecryptable");
	}
	return { problem: null, secret: { present: true, value: decrypted.value } };
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
	current: { source: SettingsSource },
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
