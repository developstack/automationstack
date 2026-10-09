import { saveAuthSettings } from "@automationstack/db/repositories/auth-settings-repository";

import { diffAuthSettings } from "./settings-change-log";
import type { SaveAuthSettingsInput } from "./settings-input";
import { secretColumnFor } from "./settings-secrets";
import {
	getEffectiveAuthSettings,
	invalidateAuthSettingsCache,
} from "./settings-store";

export interface SettingsActor {
	id: string;
	username: string;
}

export type SaveAuthSettingsOutcome =
	| { kind: "master-key-missing" }
	| { kind: "ok" };

export type SettingsAuditLog = (message: string) => void;

export interface SaveOptions {
	auditLog?: SettingsAuditLog;
	/** 保存前测试连接通过的时间。设置后写入 last_test_ok_at。 */
	testedOkAt?: Date;
}

/**
 * 保存认证设置：加密密钥，写入 auth_settings 和一条修改记录，然后让缓存失效。
 * 认证方式变化时写审计日志。输入必须已经通过 checkAuthSettingsInput。
 */
export async function saveEffectiveAuthSettings(
	input: SaveAuthSettingsInput,
	actor: SettingsActor,
	options: SaveOptions = {}
): Promise<SaveAuthSettingsOutcome> {
	const auditLog = options.auditLog ?? console.warn;
	// 先让缓存失效，保证修改记录与数据库中的当前值比较。
	invalidateAuthSettingsCache();
	const current = await getEffectiveAuthSettings();
	const [clientSecret, webhookSecret] = await Promise.all([
		secretColumnFor(input.clientSecret, current, current.clientSecret),
		secretColumnFor(input.webhookSecret, current, current.webhookSecret),
	]);
	if (clientSecret.kind !== "ok" || webhookSecret.kind !== "ok") {
		return { kind: "master-key-missing" };
	}
	const changedFields = diffAuthSettings(current, input);
	await saveAuthSettings({
		actorId: actor.id,
		changedFields,
		values: {
			adminRole: input.adminRole,
			clientId: input.clientId,
			clientSecretCipher: clientSecret.cipher,
			issuer: input.issuer,
			// 配置变化后，上一次测试连接的结果不再有效。
			lastTestOkAt:
				options.testedOkAt ?? (changedFields.length > 0 ? null : undefined),
			organization: input.organization,
			provider: input.provider,
			redirectUrl: input.redirectUrl,
			webhookSecretCipher: webhookSecret.cipher,
		},
	});
	invalidateAuthSettingsCache();
	if (current.provider !== input.provider) {
		auditLog(
			`[审计] 认证方式已从「${current.provider}」改为「${input.provider}」。操作人：「${actor.username}」。`
		);
	}
	return { kind: "ok" };
}
