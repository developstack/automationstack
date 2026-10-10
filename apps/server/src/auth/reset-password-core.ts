import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "@automationstack/db/password";
import type { User } from "@automationstack/db/schema/users";

export const RESET_PASSWORD_USAGE =
	"用法：tsx scripts/reset-password.ts <用户名>。新密码从环境变量 NEW_PASSWORD 读取；不设置时随机生成。";

export interface ResetPasswordInput {
	/** 命令行位置参数（不含 node 和脚本路径）。 */
	args: readonly string[];
	generatePassword: () => string;
	/** 环境变量 NEW_PASSWORD；空字符串等于未设置。 */
	newPassword: string | undefined;
	/** 按 args[0] 查到的账号；没有查到时为 null。 */
	user: Pick<User, "authSource" | "disabledAt" | "id" | "username"> | null;
}

export type ResetPasswordPlan =
	| { kind: "error"; message: string }
	| {
			generated: boolean;
			kind: "reset";
			password: string;
			reenable: boolean;
			userId: string;
			username: string;
	  };

export function readUsernameArg(args: readonly string[]): string | null {
	if (args.length !== 1) {
		return null;
	}
	const username = args[0]?.trim();
	return username ? username : null;
}

/** 环境变量 NEW_PASSWORD 的值；空字符串等于未设置。 */
export function readNewPassword(value: string | undefined): string | undefined {
	return value === "" ? undefined : value;
}

/** 检查 NEW_PASSWORD 的长度。返回的错误信息不含密码。 */
export function checkNewPassword(password: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `NEW_PASSWORD 至少 ${MIN_PASSWORD_LENGTH} 个字符。`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `NEW_PASSWORD 最多 ${MAX_PASSWORD_LENGTH} 个字符。`;
	}
	return null;
}

/**
 * 决定 reset-password 脚本做什么（plan 021 T6）。纯函数，不访问数据库。
 * 错误信息不含密码。
 */
export function planPasswordReset(
	input: ResetPasswordInput
): ResetPasswordPlan {
	if (readUsernameArg(input.args) === null) {
		// 多余的参数可能是密码，所以不回显参数。
		return { kind: "error", message: RESET_PASSWORD_USAGE };
	}
	const provided = readNewPassword(input.newPassword);
	if (provided !== undefined) {
		const problem = checkNewPassword(provided);
		if (problem !== null) {
			return { kind: "error", message: problem };
		}
	}
	if (input.user === null) {
		return { kind: "error", message: "账号不存在。" };
	}
	if (input.user.authSource !== "local") {
		return {
			kind: "error",
			message: `账号「${input.user.username}」不是本地账号，不能重置本地密码。`,
		};
	}
	return {
		generated: provided === undefined,
		kind: "reset",
		password: provided ?? input.generatePassword(),
		reenable: input.user.disabledAt !== null,
		userId: input.user.id,
		username: input.user.username,
	};
}
