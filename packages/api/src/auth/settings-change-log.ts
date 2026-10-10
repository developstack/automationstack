import type { ChangedSettingsField } from "@automationstack/db/schema/auth-settings";

import type { SaveAuthSettingsInput, SecretUpdate } from "./settings-input";
import type { EffectiveAuthSettings, StoredSecret } from "./settings-model";

const PLAIN_FIELDS = [
	"provider",
	"issuer",
	"organization",
	"clientId",
	"redirectUrl",
	"adminRole",
	"projectAdminRole",
] as const;

function secretChange(
	update: SecretUpdate,
	current: StoredSecret
): ChangedSettingsField["change"] | null {
	if (update.kind === "set") {
		return "changed";
	}
	if (update.kind === "clear" && current.present) {
		return "cleared";
	}
	return null;
}

/**
 * 修改记录中的字段列表。只记录字段名和「已修改 / 已清空」，不记录任何值，
 * 所以密钥的值不会进入修改记录（plan 021 §10.3）。
 */
export function diffAuthSettings(
	current: EffectiveAuthSettings,
	next: SaveAuthSettingsInput
): ChangedSettingsField[] {
	const changes: ChangedSettingsField[] = [];
	for (const field of PLAIN_FIELDS) {
		if (current[field] !== next[field]) {
			changes.push({
				change: next[field] === null ? "cleared" : "changed",
				field,
			});
		}
	}
	const secrets = [
		["clientSecret", secretChange(next.clientSecret, current.clientSecret)],
		["webhookSecret", secretChange(next.webhookSecret, current.webhookSecret)],
	] as const;
	for (const [field, change] of secrets) {
		if (change !== null) {
			changes.push({ change, field });
		}
	}
	return changes;
}
