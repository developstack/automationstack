/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

// 密码只从环境变量 NEW_PASSWORD 读取，不从命令参数读取：
// 命令参数会进入 shell 历史和进程列表。

import { planSeedAdmin } from "../apps/server/src/auth/seed-admin-core";
import {
	generateRandomPassword,
	hashPassword,
} from "../packages/db/src/password";
import {
	createUser,
	getUserByUsername,
} from "../packages/db/src/repositories/users-repository";

const ARGV_OFFSET = 2;
const EXIT_FAILURE = 1;

function fail(message: string): never {
	console.error(message);
	process.exit(EXIT_FAILURE);
}

async function main(): Promise<void> {
	const plan = planSeedAdmin({
		args: process.argv.slice(ARGV_OFFSET),
		newPassword: process.env.NEW_PASSWORD,
	});
	if (plan.kind === "error") {
		fail(plan.message);
	}
	const { username } = plan;

	const existing = await getUserByUsername(username);
	if (existing !== null) {
		fail(
			`账号「${username}」已存在。要重置密码，请用 make db-reset-password USER=${username}，或到「用户管理」页面重置。`
		);
	}

	const password = plan.password ?? generateRandomPassword();
	const user = await createUser({
		passwordHash: await hashPassword(password),
		role: "admin",
		username,
	});
	if (user === null) {
		fail(`账号「${username}」刚刚被别的进程创建了，请重试。`);
	}

	// 创建管理员是破窗操作，用 warn 级别记录，便于审计。不写密码。
	console.warn(`[审计] seed-admin：已创建管理员「${username}」。`);
	if (plan.password === undefined) {
		console.log(`初始密码（仅此一次可见）：${password}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
