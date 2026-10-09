import type { LocalLoginAdminBlocker } from "@automationstack/db/local-login";
import { isKnownDevSecret } from "@automationstack/env/dev-secrets";

export interface BootstrapAdminInput {
	/** 已占用 ADMIN_USERNAME 的账号不能作为本地登录管理员的原因；没有这个账号时为 null。 */
	existingUserBlocker: LocalLoginAdminBlocker | null;
	/** ADMIN_INITIAL_PASSWORD；未配置时为 undefined。 */
	initialPassword: string | undefined;
	localLoginAdminCount: number;
	localLoginEnabled: boolean;
	production: boolean;
	username: string;
}

export type BootstrapAdminDecision =
	| { kind: "create"; mustChangePassword: boolean; password: string }
	| { kind: "fail"; message: string }
	| { kind: "skip"; reason: "admin-exists" | "local-login-disabled" }
	| { kind: "warn"; message: string };

const BLOCKER_LABEL: Record<LocalLoginAdminBlocker, string> = {
	disabled: "已被禁用",
	"external-account": "不是本地账号",
	"no-password": "没有本地密码",
	"not-admin": "不是管理员",
};

const RESET_PASSWORD_HINT =
	"请修改 ADMIN_USERNAME，或用 scripts/reset-password.ts 恢复该账号。";

// reset-password 脚本只能重置密码和解除禁用，不能把成员提升为管理员，也不能把外部账号改成本地账号。
const BLOCKER_HINT: Record<LocalLoginAdminBlocker, string> = {
	disabled: RESET_PASSWORD_HINT,
	"external-account": "请修改 ADMIN_USERNAME。",
	"no-password": RESET_PASSWORD_HINT,
	"not-admin":
		"请修改 ADMIN_USERNAME，或由其他管理员在「用户管理」页面把该账号设为管理员。",
};

function missingOrBlocked(
	production: boolean,
	message: string
): BootstrapAdminDecision {
	return production ? { kind: "fail", message } : { kind: "warn", message };
}

/**
 * 决定启动时是否创建引导管理员（plan 021 D2）。纯函数，不读环境变量，不访问数据库。
 * 返回的 message 只含用户名和原因，不含密码。
 */
export function decideBootstrapAdmin(
	input: BootstrapAdminInput
): BootstrapAdminDecision {
	if (!input.localLoginEnabled) {
		return { kind: "skip", reason: "local-login-disabled" };
	}
	if (input.localLoginAdminCount > 0) {
		return { kind: "skip", reason: "admin-exists" };
	}
	if (input.existingUserBlocker !== null) {
		return missingOrBlocked(
			input.production,
			`没有可以本地登录的管理员，但用户名「${input.username}」已被占用：该账号${BLOCKER_LABEL[input.existingUserBlocker]}。${BLOCKER_HINT[input.existingUserBlocker]}`
		);
	}
	if (input.initialPassword === undefined) {
		return missingOrBlocked(
			input.production,
			`没有可以本地登录的管理员，并且没有配置 ADMIN_INITIAL_PASSWORD，所以不能创建引导管理员「${input.username}」。`
		);
	}
	// 生产环境的 env 校验已经拒绝开发默认值（packages/env/src/dev-secrets.ts）。
	// 这里再检查一次，使这个函数自身也成立。
	if (input.production && isKnownDevSecret(input.initialPassword)) {
		return {
			kind: "fail",
			message:
				"ADMIN_INITIAL_PASSWORD 是仓库公开的开发默认值。生产环境必须使用自己的密码。",
		};
	}
	return {
		kind: "create",
		mustChangePassword: input.production,
		password: input.initialPassword,
	};
}
