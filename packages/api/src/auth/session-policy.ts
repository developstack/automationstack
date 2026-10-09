import type { User } from "@automationstack/db/schema/users";

import type { EffectiveAuthSettings } from "./settings-model";

/**
 * 会话 cookie 和 API token 能否继续使用（plan 021 §10.4、§2 第 12 项、D7）。
 * casdoor 模式下，本地普通用户的会话立即失效；本地管理员的会话仍然有效（应急登录）。
 * local 模式下，Casdoor 用户的会话立即失效。再切到 casdoor 模式后，这些会话恢复有效。
 */
export function isSessionUserAllowed(
	user: Pick<User, "authSource" | "role">,
	settings: Pick<EffectiveAuthSettings, "provider">
): boolean {
	if (settings.provider === "local") {
		return user.authSource === "local";
	}
	return !(user.authSource === "local" && user.role !== "admin");
}
