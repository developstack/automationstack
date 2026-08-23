/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

/**
 * 创建首个管理员账号。
 *
 *   pnpm db:seed-admin <用户名> [密码]
 *
 * 密码省略时随机生成并打印一次——**只打印这一次**，库里只存 PBKDF2 散列。
 * 平台不开放自助注册（账号一律由管理员创建），所以第一个管理员只能从这里来。
 *
 * 幂等性：用户名已存在时不覆盖密码，直接退出并提示改用成员管理页面重置，
 * 免得误跑一次脚本就把在用账号的密码悄悄换掉。
 *
 * 依赖 tsx 运行（见根 package.json 的 db:seed-admin），cwd 为 apps/server，
 * 因此 dotenv 能自动读到 apps/server/.env 里的 DATABASE_URL。
 */

import { hashPassword } from "../packages/db/src/password";
import {
	createUser,
	getUserByUsername,
} from "../packages/db/src/repositories/users-repository";

/** 随机密码的字节数：24 字节 → 32 个 base64url 字符。 */
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
