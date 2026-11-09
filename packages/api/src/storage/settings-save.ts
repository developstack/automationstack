import { saveStorageSettings } from "@automationstack/db/repositories/storage-settings-repository";
import type { ChangedSettingsField } from "@automationstack/db/schema/settings-change-log";

import type { SettingsActor } from "../settings/actor";
import { secretColumnFor } from "../settings/secrets";
import type { SaveStorageSettingsInput } from "./settings-input";
import type { EffectiveStorageSettings, R2Connection } from "./settings-model";
import {
	getEffectiveStorageSettings,
	invalidateStorageSettingsCache,
} from "./settings-store";

export type SaveStorageSettingsOutcome =
	| { kind: "connection-failed"; message: string }
	| { kind: "master-key-missing" }
	| { kind: "ok" };

/** 存储方式是 R2 时，保存前检查连接。失败时返回原因。 */
export type R2ConnectionCheck = (
	connection: R2Connection
) => Promise<string | null>;

function plainFields(settings: EffectiveStorageSettings) {
	return {
		backend: settings.backend,
		publicBaseUrl: settings.r2.publicBaseUrl,
		r2AccessKeyId: settings.r2.accessKeyId,
		r2Bucket: settings.r2.bucket,
		r2Endpoint: settings.r2.endpoint,
	};
}

/** 修改记录中的字段列表。只记录字段名和「已修改 / 已清空」，不记录任何值。 */
export function diffStorageSettings(
	current: EffectiveStorageSettings,
	next: SaveStorageSettingsInput
): ChangedSettingsField[] {
	const before = plainFields(current);
	const changes: ChangedSettingsField[] = [];
	for (const field of Object.keys(before) as (keyof typeof before)[]) {
		if (before[field] !== next[field]) {
			changes.push({
				change: next[field] === null ? "cleared" : "changed",
				field,
			});
		}
	}
	const secret = next.r2SecretAccessKey;
	if (secret.kind === "set") {
		changes.push({ change: "changed", field: "r2SecretAccessKey" });
	}
	if (secret.kind === "clear" && current.r2.secretAccessKey.present) {
		changes.push({ change: "cleared", field: "r2SecretAccessKey" });
	}
	return changes;
}

function secretValueOf(
	input: SaveStorageSettingsInput,
	current: EffectiveStorageSettings
): string | null {
	const secret = input.r2SecretAccessKey;
	if (secret.kind === "set") {
		return secret.value;
	}
	return secret.kind === "keep" ? current.r2.secretAccessKey.value : null;
}

function connectionOf(
	input: SaveStorageSettingsInput,
	current: EffectiveStorageSettings
): R2Connection | null {
	const secretAccessKey = secretValueOf(input, current);
	if (
		!(input.r2AccessKeyId && input.r2Bucket && input.r2Endpoint) ||
		secretAccessKey === null
	) {
		return null;
	}
	return {
		accessKeyId: input.r2AccessKeyId,
		bucket: input.r2Bucket,
		endpoint: input.r2Endpoint,
		publicBaseUrl: input.publicBaseUrl,
		secretAccessKey,
	};
}

/**
 * 保存存储设置：存储方式是 R2 时先检查连接，再加密密钥，写入 storage_settings
 * 和一条修改记录，然后让缓存失效。输入必须已经通过 checkStorageSettingsInput。
 */
export async function saveEffectiveStorageSettings(
	input: SaveStorageSettingsInput,
	actor: SettingsActor,
	checkConnection: R2ConnectionCheck
): Promise<SaveStorageSettingsOutcome> {
	// 先让缓存失效，保证修改记录与数据库中的当前值比较。
	invalidateStorageSettingsCache();
	const current = await getEffectiveStorageSettings();
	if (input.backend === "r2") {
		const connection = connectionOf(input, current);
		const problem =
			connection === null
				? "已保存的 Secret Access Key 不能解密。重新填写它"
				: await checkConnection(connection);
		if (problem !== null) {
			return { kind: "connection-failed", message: problem };
		}
	}
	const secret = await secretColumnFor(
		input.r2SecretAccessKey,
		current,
		current.r2.secretAccessKey
	);
	if (secret.kind !== "ok") {
		return { kind: "master-key-missing" };
	}
	await saveStorageSettings({
		actorId: actor.id,
		changedFields: diffStorageSettings(current, input),
		values: {
			backend: input.backend,
			publicBaseUrl: input.publicBaseUrl,
			r2AccessKeyId: input.r2AccessKeyId,
			r2Bucket: input.r2Bucket,
			r2Endpoint: input.r2Endpoint,
			r2SecretAccessKeyCipher: secret.cipher,
		},
	});
	invalidateStorageSettingsCache();
	return { kind: "ok" };
}
