import {
	isManagedByCasdoor,
	isUserCreateClosed,
} from "@automationstack/api/auth/casdoor/managed-users";
import type { AuthSource, PublicUser } from "@automationstack/db/schema/users";

/** 当前认证方式。还没有读到 auth.config 时为 null：只按账号来源限制，服务端仍然检查。 */
export type KnownProvider = "casdoor" | "local" | null;

export const AUTH_SOURCE_LABEL: Record<AuthSource, string> = {
	casdoor: "Casdoor",
	local: "本地",
};

/** local 模式下 Casdoor 用户的提示（plan 021 §2 第 12 项）。 */
export const CASDOOR_UNUSABLE_IN_LOCAL_HINT =
	"Casdoor 账号，本地登录模式下不能使用";

export const CASDOOR_CREATE_HINT =
	"Casdoor 模式下不能在本系统中创建用户。请在 Casdoor 中管理用户，用户第一次登录时自动加入本系统。";

/** 账号来源列中的说明。local 模式下的 Casdoor 用户不能使用本系统，在表格中直接显示。 */
export function accountSourceNote(
	user: Pick<PublicUser, "authSource">,
	provider: KnownProvider
): string | null {
	return provider === "local" && isManagedByCasdoor(user)
		? CASDOOR_UNUSABLE_IN_LOCAL_HINT
		: null;
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
