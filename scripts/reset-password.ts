/** biome-ignore-all lint/suspicious/noConsole: 运维脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

// 重置一个本地账号的密码，用于找回丢失的管理员密码（plan 021 T6）。
// 新密码只从环境变量 NEW_PASSWORD 读取，不从命令参数读取：
// 命令参数会进入 shell 历史和进程列表。

import {
	planPasswordReset,
	readUsernameArg,
} from "../apps/server/src/auth/reset-password-core";
import {
	generateRandomPassword,
	hashPassword,
} from "../packages/db/src/password";
import {
	getUserByUsername,
	setUserDisabled,
	updateUserPasswordHash,
} from "../packages/db/src/repositories/users-repository";

const ARGV_OFFSET = 2;
const EXIT_FAILURE = 1;

function fail(message: string): never {
	console.error(message);
	process.exit(EXIT_FAILURE);
}

async function main(): Promise<void> {
	const args = process.argv.slice(ARGV_OFFSET);
	const username = readUsernameArg(args);
	const plan = planPasswordReset({
		args,
		generatePassword: generateRandomPassword,
		newPassword: process.env.NEW_PASSWORD,
		user: username === null ? null : await getUserByUsername(username),
	});
	if (plan.kind === "error") {
		fail(plan.message);
	}

	const updated = await updateUserPasswordHash(
		plan.userId,
		await hashPassword(plan.password),
		true
	);
	if (!updated) {
		fail(`账号「${plan.username}」刚刚被删除，没有重置。`);
	}
	if (plan.reenable) {
		await setUserDisabled(plan.userId, false);
	}

	// 破窗操作用 warn 级别记录，便于审计。只写用户名和操作，不写密码。
	console.warn(
		plan.reenable
			? `[审计] reset-password：已重置账号「${plan.username}」的密码，并解除禁用。`
			: `[审计] reset-password：已重置账号「${plan.username}」的密码。`
	);
	console.log("该账号下次登录后必须修改密码。");
	if (plan.generated) {
		console.log(`新密码（仅此一次可见）：${plan.password}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
