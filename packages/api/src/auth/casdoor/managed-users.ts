// Casdoor 模式下用户管理接口的限制（plan 021 T12）。
// 这个文件没有服务端依赖，前端也可以导入。

/** 修改 Casdoor 用户的角色、禁用状态或密码时的错误信息。错误码为 FORBIDDEN。 */
export const CASDOOR_MANAGED_USER_MESSAGE =
	"这个账号由 Casdoor 管理，请在 Casdoor 中管理";

/** Casdoor 模式下创建用户时的错误信息。错误码为 FORBIDDEN。 */
export const CASDOOR_USER_CREATE_MESSAGE =
	"Casdoor 模式下不能在本系统中创建用户，请在 Casdoor 中管理";

interface ProviderOnly {
	provider: "casdoor" | "local";
}

/** Casdoor 模式下，auth_source = casdoor 的用户只能在 Casdoor 中管理。 */
export function isManagedByCasdoor(
	user: { authSource: "casdoor" | "local" },
	settings: ProviderOnly
): boolean {
	return settings.provider === "casdoor" && user.authSource === "casdoor";
}

/** Casdoor 模式下关闭本系统的创建用户功能。 */
export function isUserCreateClosed(settings: ProviderOnly): boolean {
	return settings.provider === "casdoor";
}
