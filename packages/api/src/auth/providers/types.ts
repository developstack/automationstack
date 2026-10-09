import type { AuthProviderId } from "@automationstack/db/schema/auth-settings";

import type { EffectiveAuthSettings } from "../settings-model";

/**
 * 本地密码表单对哪些账号开放（plan 021 D7）：
 * - all-local-accounts：local 模式，所有本地账号。
 * - local-admins-only：casdoor 模式的应急登录，只有本地管理员。
 * - disabled：本地密码登录完全关闭。
 */
export type LocalLoginPolicy =
	| "all-local-accounts"
	| "disabled"
	| "local-admins-only";

/** 认证提供方。auth.config 和登录接口按当前生效的认证方式选择提供方。 */
export interface AuthProvider {
	readonly id: AuthProviderId;
	/** 本地密码表单的开放范围。 */
	localLoginPolicy: (settings: EffectiveAuthSettings) => LocalLoginPolicy;
	/** 浏览器跳转登录的入口。没有这个入口时返回 null。 */
	loginUrl: (settings: EffectiveAuthSettings) => string | null;
}
