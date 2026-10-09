import {
	checkNewPassword,
	readNewPassword,
	readUsernameArg,
} from "./reset-password-core";

export const SEED_ADMIN_USAGE =
	"用法：tsx scripts/seed-admin.ts <用户名>。密码从环境变量 NEW_PASSWORD 读取；不设置时随机生成。";

export interface SeedAdminInput {
	/** 命令行位置参数（不含 node 和脚本路径）。 */
	args: readonly string[];
	/** 环境变量 NEW_PASSWORD；空字符串等于未设置。 */
	newPassword: string | undefined;
}

export type SeedAdminPlan =
	| { kind: "error"; message: string }
	| { kind: "create"; password: string | undefined; username: string };

/**
 * 决定 seed-admin 脚本做什么。纯函数，不访问数据库。
 * 密码只从 NEW_PASSWORD 读取：命令参数会进入 shell 历史和进程列表。
 * 错误信息不含密码，也不回显参数。
 */
export function planSeedAdmin(input: SeedAdminInput): SeedAdminPlan {
	const username = readUsernameArg(input.args);
	if (username === null) {
		// 多余的参数可能是密码，所以不回显参数。
		return { kind: "error", message: SEED_ADMIN_USAGE };
	}
	const password = readNewPassword(input.newPassword);
	if (password !== undefined) {
		const problem = checkNewPassword(password);
		if (problem !== null) {
			return { kind: "error", message: problem };
		}
	}
	return { kind: "create", password, username };
}
