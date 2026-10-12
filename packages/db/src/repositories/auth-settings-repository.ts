import { eq } from "drizzle-orm";

import { db } from "../index";
import {
	AUTH_SETTINGS_ROW_ID,
	type AuthProviderId,
	type AuthSettingsRow,
	authSettings,
	type ChangedSettingsField,
	settingsChangeLog,
} from "../schema/auth-settings";

export const AUTH_SETTINGS_KEY = "auth";

export async function getAuthSettingsRow(): Promise<AuthSettingsRow | null> {
	const [row] = await db
		.select()
		.from(authSettings)
		.where(eq(authSettings.id, AUTH_SETTINGS_ROW_ID))
		.limit(1);
	return row ?? null;
}

/** 只读 updated_at。缓存用它判断数据库中的认证设置是否变化。 */
export async function getAuthSettingsUpdatedAt(): Promise<Date | null> {
	const [row] = await db
		.select({ updatedAt: authSettings.updatedAt })
		.from(authSettings)
		.where(eq(authSettings.id, AUTH_SETTINGS_ROW_ID))
		.limit(1);
	return row?.updatedAt ?? null;
}

/**
 * 密钥列的三种写法：undefined 表示保留原值，null 表示清空，字符串表示新密文。
 * 其他列总是写入。
 */
export interface SaveAuthSettingsInput {
	actorId: string;
	changedFields: ChangedSettingsField[];
	values: {
		adminRole: string | null;
		clientId: string | null;
		clientSecretCipher?: string | null;
		issuer: string | null;
		lastTestOkAt?: Date | null;
		organization: string | null;
		projectAdminRole: string | null;
		provider: AuthProviderId;
		redirectUrl: string | null;
		webhookSecretCipher?: string | null;
	};
}

/** 保存认证设置，并在同一个事务中写一条修改记录。 */
export function saveAuthSettings(
	input: SaveAuthSettingsInput
): Promise<AuthSettingsRow> {
	const values = {
		...input.values,
		updatedAt: new Date(),
		updatedBy: input.actorId,
	};
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(authSettings)
			.values({ ...values, id: AUTH_SETTINGS_ROW_ID })
			.onConflictDoUpdate({ set: values, target: authSettings.id })
			.returning();
		if (!row) {
			throw new Error("saveAuthSettings: upsert returned no row");
		}
		await tx.insert(settingsChangeLog).values({
			actorId: input.actorId,
			changedFields: input.changedFields,
			settingsKey: AUTH_SETTINGS_KEY,
		});
		return row;
	});
}

/** 记录测试连接成功的时间。不修改 updated_at：测试连接不是修改配置。 */
export async function markAuthSettingsTestOk(at: Date): Promise<void> {
	await db
		.update(authSettings)
		.set({ lastTestOkAt: at })
		.where(eq(authSettings.id, AUTH_SETTINGS_ROW_ID));
}

/** 运维命令 auth-set-local 写入的值。没有 auth_settings 行时，用这些值创建这一行。 */
export interface LocalProviderDefaults {
	adminRole: string | null;
	clientId: string | null;
	issuer: string | null;
	organization: string | null;
	projectAdminRole: string | null;
	redirectUrl: string | null;
}

/**
 * 把认证方式改为 local（plan 021 §10.5 第 5 项），并在同一个事务中写一条修改记录。
 * 已有这一行时只修改 provider，其他列不变。没有这一行时用 defaults 创建，不写密钥。
 * 操作人为 null：运维命令没有登录用户。
 */
export function forceLocalAuthProvider(
	defaults: LocalProviderDefaults
): Promise<AuthSettingsRow> {
	const now = new Date();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(authSettings)
			.values({
				...defaults,
				id: AUTH_SETTINGS_ROW_ID,
				provider: "local",
				updatedAt: now,
				updatedBy: null,
			})
			.onConflictDoUpdate({
				set: { provider: "local", updatedAt: now, updatedBy: null },
				target: authSettings.id,
			})
			.returning();
		if (!row) {
			throw new Error("forceLocalAuthProvider: upsert returned no row");
		}
		await tx.insert(settingsChangeLog).values({
			actorId: null,
			changedFields: [{ change: "changed", field: "provider" }],
			settingsKey: AUTH_SETTINGS_KEY,
		});
		return row;
	});
}
