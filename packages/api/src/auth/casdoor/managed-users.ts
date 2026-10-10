// 用户管理接口对 Casdoor 用户的限制（plan 021 T12、§2 第 12 项）。
// 这个文件没有服务端依赖，前端也可以导入。

/** 修改 Casdoor 用户的角色或禁用状态时的错误信息。错误码为 FORBIDDEN。 */
export const CASDOOR_MANAGED_USER_MESSAGE =
	"这个账号由 Casdoor 管理，请在 Casdoor 中管理";

/** 重置 Casdoor 用户的密码时的错误信息。错误码为 FORBIDDEN。 */
export const CASDOOR_NO_LOCAL_PASSWORD_MESSAGE =
	"Casdoor 账号没有本地密码，不能重置。";

/** Casdoor 模式下创建用户时的错误信息。错误码为 FORBIDDEN。 */
export const CASDOOR_USER_CREATE_MESSAGE =
	"Casdoor 模式下不能在本系统中创建用户，请在 Casdoor 中管理";

interface ProviderOnly {
	provider: "casdoor" | "local";
}

/**
 * auth_source = casdoor 的用户在任何模式下都只能在 Casdoor 中管理：
 * 没有本地密码；角色和禁用状态在 casdoor 模式下由登录和对账覆盖；
 * local 模式下这些用户不能使用本系统，修改没有作用。
 */
export function isManagedByCasdoor(user: {
	authSource: "casdoor" | "local";
}): boolean {
	return user.authSource === "casdoor";
}

/** Casdoor 模式下关闭本系统的创建用户功能。 */
export function isUserCreateClosed(settings: ProviderOnly): boolean {
	return settings.provider === "casdoor";
}
