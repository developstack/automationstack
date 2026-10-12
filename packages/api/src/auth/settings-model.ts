import type { AuthProviderId } from "@automationstack/db/schema/auth-settings";

/** 配置来源：页面配置（数据库中有 auth_settings 行）或环境变量。 */
export type AuthSettingsSource = "database" | "env";

/** 已保存的密钥不能解密的原因。与 Jira 配置使用相同的值。 */
export type AuthCredentialProblem = "master-key-missing" | "undecryptable";

/**
 * 一个密钥的状态。present 为 true 但 value 为 null，表示数据库中有密文，
 * 但现在不能解密（原因见 credentialProblem）。
 */
export interface StoredSecret {
	present: boolean;
	value: string | null;
}

export const NO_SECRET: StoredSecret = { present: false, value: null };

/** 当前生效的认证设置。只在服务端内存中使用，密钥是明文，不得返回前端。 */
export interface EffectiveAuthSettings {
	adminRole: string | null;
	/** 环境变量 AUTH_ALLOW_LOCAL_LOGIN，页面不能修改。 */
	allowLocalLogin: boolean;
	clientId: string | null;
	clientSecret: StoredSecret;
	credentialProblem: AuthCredentialProblem | null;
	/** 环境变量 CASDOOR_INTERNAL_URL，页面不能修改。 */
	internalUrl: string | null;
	issuer: string | null;
	lastTestOkAt: Date | null;
	organization: string | null;
	/** Casdoor 中的项目管理员角色名（#15）。 */
	projectAdminRole: string | null;
	provider: AuthProviderId;
	redirectUrl: string | null;
	source: AuthSettingsSource;
	updatedAt: Date | null;
	updatedBy: string | null;
	webhookSecret: StoredSecret;
}
