import { DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE } from "@automationstack/env/casdoor-rules";

import { type EffectiveAuthSettings, NO_SECRET } from "./settings-model";

/** 测试用的认证设置：local 模式，来源为环境变量，只有项目管理员角色名的默认值。 */
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
		projectAdminRole: DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE,
		provider: "local",
		redirectUrl: null,
		source: "env",
		updatedAt: null,
		updatedBy: null,
		webhookSecret: NO_SECRET,
		...overrides,
	};
}
