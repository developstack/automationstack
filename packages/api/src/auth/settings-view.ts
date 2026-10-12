import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { AuthProviderId } from "@automationstack/db/schema/auth-settings";

import { CASDOOR_CALLBACK_PATH, CASDOOR_WEBHOOK_PATH } from "./casdoor-paths";
import type {
	AuthCredentialProblem,
	AuthSettingsSource,
	EffectiveAuthSettings,
} from "./settings-model";
import { isSecretStorageAvailable } from "./settings-secrets";

/** 认证设置页面的数据。不包含任何密钥的值，只说明密钥是否已设置。 */
export interface AuthSettingsView {
	adminRole: string | null;
	allowLocalLogin: boolean;
	callbackPath: string;
	/** 页面能否选择 Casdoor 模式。阶段 3 实现后总是 true。 */
	casdoorSelectable: boolean;
	clientId: string | null;
	credentialProblem: AuthCredentialProblem | null;
	hasClientSecret: boolean;
	hasWebhookSecret: boolean;
	internalUrl: string | null;
	issuer: string | null;
	lastTestOkAt: Date | null;
	organization: string | null;
	projectAdminRole: string | null;
	provider: AuthProviderId;
	redirectUrl: string | null;
	secretStorageAvailable: boolean;
	source: AuthSettingsSource;
	updatedAt: Date | null;
	updatedByUsername: string | null;
	webhookPath: string;
}

async function usernameOf(userId: string | null): Promise<string | null> {
	if (userId === null) {
		return null;
	}
	const user = await getUserById(userId);
	return user?.username ?? null;
}

export async function toAuthSettingsView(
	settings: EffectiveAuthSettings
): Promise<AuthSettingsView> {
	return {
		adminRole: settings.adminRole,
		allowLocalLogin: settings.allowLocalLogin,
		callbackPath: CASDOOR_CALLBACK_PATH,
		casdoorSelectable: true,
		clientId: settings.clientId,
		credentialProblem: settings.credentialProblem,
		hasClientSecret: settings.clientSecret.present,
		hasWebhookSecret: settings.webhookSecret.present,
		internalUrl: settings.internalUrl,
		issuer: settings.issuer,
		lastTestOkAt: settings.lastTestOkAt,
		organization: settings.organization,
		projectAdminRole: settings.projectAdminRole,
		provider: settings.provider,
		redirectUrl: settings.redirectUrl,
		secretStorageAvailable: isSecretStorageAvailable(),
		source: settings.source,
		updatedAt: settings.updatedAt,
		updatedByUsername: await usernameOf(settings.updatedBy),
		webhookPath: CASDOOR_WEBHOOK_PATH,
	};
}
