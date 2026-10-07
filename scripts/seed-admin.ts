/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

import { hashPassword } from "../packages/db/src/password";
import {
	createUser,
	getUserByUsername,
} from "../packages/db/src/repositories/users-repository";

const GENERATED_PASSWORD_BYTES = 24;
const MIN_PASSWORD_LENGTH = 8;

const EXIT_FAILURE = 1;

const PLUS_TO_DASH = /\+/g;
const SLASH_TO_UNDERSCORE = /\//g;
const TRAILING_EQUALS = /[=]+$/;

function generatePassword(): string {
	const bytes = crypto.getRandomValues(
		new Uint8Array(GENERATED_PASSWORD_BYTES)
	);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(PLUS_TO_DASH, "-")
		.replace(SLASH_TO_UNDERSCORE, "_")
		.replace(TRAILING_EQUALS, "");
}

function fail(message: string): never {
	console.error(message);
	process.exit(EXIT_FAILURE);
}

async function main(): Promise<void> {
	const [rawUsername, rawPassword] = process.argv.slice(2);
	const username = rawUsername?.trim();
	if (!username) {
		fail("用法：pnpm db:seed-admin <用户名> [密码]");
	}
	if (rawPassword !== undefined && rawPassword.length < MIN_PASSWORD_LENGTH) {
		fail(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
	}

	const existing = await getUserByUsername(username);
	if (existing !== null) {
		fail(`账号「${username}」已存在；要改密码请到成员管理页面重置。`);
	}

	const password = rawPassword ?? generatePassword();
	const user = await createUser({
		passwordHash: await hashPassword(password),
		role: "admin",
		username,
	});
	if (user === null) {
		fail(`账号「${username}」刚刚被别的进程创建了，请重试。`);
	}

	console.log(`已创建管理员：${username}`);
	if (rawPassword === undefined) {
		console.log(`初始密码（仅此一次可见）：${password}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
