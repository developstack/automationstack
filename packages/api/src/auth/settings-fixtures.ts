import { type EffectiveAuthSettings, NO_SECRET } from "./settings-model";

/** 测试用的认证设置：local 模式，来源为环境变量，没有 Casdoor 参数。 */
export function effectiveSettings(
	overrides: Partial<EffectiveAuthSettings> = {}
): EffectiveAuthSettings {
	return {
		adminRole: null,
		allowLocalLogin: true,
		clientId: null,
		clientSecret: NO_SECRET,
		credentialProblem: null,
		internalUrl: null,
		issuer: null,
		lastTestOkAt: null,
		organization: null,
		provider: "local",
		redirectUrl: null,
		source: "env",
		updatedAt: null,
		updatedBy: null,
		webhookSecret: NO_SECRET,
		...overrides,
	};
}
