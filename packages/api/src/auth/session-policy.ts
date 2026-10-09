import type { User } from "@automationstack/db/schema/users";

import type { EffectiveAuthSettings } from "./settings-model";

/**
 * 会话 cookie 和 API token 能否继续使用（plan 021 §10.4、D7）。
 * casdoor 模式下，本地普通用户的会话立即失效；本地管理员的会话仍然有效（应急登录）。
 */
export function isSessionUserAllowed(
	user: Pick<User, "authSource" | "role">,
	settings: Pick<EffectiveAuthSettings, "provider">
): boolean {
	return !(
		settings.provider === "casdoor" &&
		user.authSource === "local" &&
		user.role !== "admin"
	);
}
