import type { AuthProviderId } from "@automationstack/db/schema/auth-settings";

import type { EffectiveAuthSettings } from "../settings-model";
import { casdoorProvider } from "./casdoor";
import { localProvider } from "./local";
import type { AuthProvider } from "./types";

const PROVIDERS: Record<AuthProviderId, AuthProvider> = {
	casdoor: casdoorProvider,
	local: localProvider,
};

export function authProviderFor(settings: EffectiveAuthSettings): AuthProvider {
	return PROVIDERS[settings.provider];
}

/** 本地密码登录是否启用：local 模式总是启用；casdoor 模式由 AUTH_ALLOW_LOCAL_LOGIN 决定。 */
export function isLocalLoginEnabled(settings: EffectiveAuthSettings): boolean {
	return authProviderFor(settings).localLoginPolicy(settings) !== "disabled";
}

/** 公开接口 auth.config 的返回值。登录页按它显示登录方式。 */
export interface AuthConfig {
	casdoorLoginUrl: string | null;
	localLoginEnabled: boolean;
	provider: AuthProviderId;
}

export function authConfigOf(settings: EffectiveAuthSettings): AuthConfig {
	return {
		casdoorLoginUrl: authProviderFor(settings).loginUrl(settings),
		localLoginEnabled: isLocalLoginEnabled(settings),
		provider: settings.provider,
	};
}
