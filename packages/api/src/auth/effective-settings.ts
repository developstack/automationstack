import type { AuthSettingsRow } from "@automationstack/db/schema/auth-settings";
import { decryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

import {
	type AuthCredentialProblem,
	type EffectiveAuthSettings,
	NO_SECRET,
	type StoredSecret,
} from "./settings-model";

function envSecret(value: string | undefined): StoredSecret {
	return value === undefined ? NO_SECRET : { present: true, value };
}

/** 数据库中没有 auth_settings 行时，认证设置取环境变量。 */
export function settingsFromEnv(): EffectiveAuthSettings {
	return {
		adminRole: env.CASDOOR_ADMIN_ROLE ?? null,
		allowLocalLogin: env.AUTH_ALLOW_LOCAL_LOGIN,
		clientId: env.CASDOOR_CLIENT_ID ?? null,
		clientSecret: envSecret(env.CASDOOR_CLIENT_SECRET),
		credentialProblem: null,
		internalUrl: env.CASDOOR_INTERNAL_URL ?? null,
		issuer: env.CASDOOR_ISSUER ?? null,
		lastTestOkAt: null,
		organization: env.CASDOOR_ORGANIZATION ?? null,
		provider: env.AUTH_PROVIDER,
		redirectUrl: env.CASDOOR_REDIRECT_URL ?? null,
		source: "env",
		updatedAt: null,
		updatedBy: null,
		webhookSecret: envSecret(env.CASDOOR_WEBHOOK_SECRET),
	};
}

interface OpenedSecret {
	problem: AuthCredentialProblem | null;
	secret: StoredSecret;
}

async function openSecret(cipher: string | null): Promise<OpenedSecret> {
	if (cipher === null) {
		return { problem: null, secret: NO_SECRET };
	}
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	const unavailable = (problem: AuthCredentialProblem): OpenedSecret => ({
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

/**
 * 数据库中有 auth_settings 行时，所有页面可以修改的项都取这一行，
 * 不再逐项回退到环境变量（plan 021 §10.2）。
 */
export async function settingsFromRow(
	row: AuthSettingsRow
): Promise<EffectiveAuthSettings> {
	const [clientSecret, webhookSecret] = await Promise.all([
		openSecret(row.clientSecretCipher),
		openSecret(row.webhookSecretCipher),
	]);
	return {
		adminRole: row.adminRole,
		allowLocalLogin: env.AUTH_ALLOW_LOCAL_LOGIN,
		clientId: row.clientId,
		clientSecret: clientSecret.secret,
		credentialProblem: clientSecret.problem ?? webhookSecret.problem,
		internalUrl: env.CASDOOR_INTERNAL_URL ?? null,
		issuer: row.issuer,
		lastTestOkAt: row.lastTestOkAt,
		organization: row.organization,
		provider: row.provider,
		redirectUrl: row.redirectUrl,
		source: "database",
		updatedAt: row.updatedAt,
		updatedBy: row.updatedBy,
		webhookSecret: webhookSecret.secret,
	};
}
