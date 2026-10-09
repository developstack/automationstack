import {
	isManagedByCasdoor,
	isUserCreateClosed,
} from "@automationstack/api/auth/casdoor/managed-users";
import type { AuthSource, PublicUser } from "@automationstack/db/schema/users";

/** 当前认证方式。还没有读到 auth.config 时为 null：界面不限制，服务端仍然检查。 */
export type KnownProvider = "casdoor" | "local" | null;

export const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
	casdoor: "Casdoor",
	local: "本地",
};

/** Casdoor 用户的操作被锁定时的提示。与服务端的错误信息说法一致。 */
export const CASDOOR_MANAGED_HINT = "请在 Casdoor 中管理";

export const CASDOOR_CREATE_HINT =
	"Casdoor 模式下不能在本系统中创建用户。请在 Casdoor 中管理用户，用户第一次登录时自动加入本系统。";

export interface PlatformUserActionAccess {
	/** 重置密码、修改平台角色、停用和恢复。项目归属总是可以管理。 */
	accountActions: boolean;
	hint: string | null;
}

/** 用户管理页面中一个用户的可用操作。规则与服务端相同（managed-users.ts）。 */
export function platformUserActionAccess(
	user: Pick<PublicUser, "authSource">,
	provider: KnownProvider
): PlatformUserActionAccess {
	if (provider !== null && isManagedByCasdoor(user, { provider })) {
		return { accountActions: false, hint: CASDOOR_MANAGED_HINT };
	}
	return { accountActions: true, hint: null };
}

export interface CreateUserAccess {
	allowed: boolean;
	hint: string | null;
}

export function createUserAccess(provider: KnownProvider): CreateUserAccess {
	if (provider !== null && isUserCreateClosed({ provider })) {
		return { allowed: false, hint: CASDOOR_CREATE_HINT };
	}
	return { allowed: true, hint: null };
}
