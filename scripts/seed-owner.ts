/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

import type { SeedOwnerOutcome } from "../packages/db/src/repositories/seed-repository";
import { getUserByUsername } from "../packages/db/src/repositories/users-repository";

export const ARGV_OFFSET = 2;

const OWNER_FLAG = "--owner";
const EXIT_FAILURE = 1;

export interface SeedOwner {
	id: string;
	username: string;
}

const NO_OWNER_WARNING = [
	`⚠️  没有指定 ${OWNER_FLAG}：种子项目不会有任何成员。`,
	"   后果是它只对平台管理员可见，普通账号登录后项目列表仍然是空的。",
	`   要让某个账号能进去，给本命令加上 ${OWNER_FLAG} <用户名> 再跑一次。`,
].join("\n");

function fail(message: string): never {
	console.error(message);
	process.exit(EXIT_FAILURE);
}

export async function resolveSeedOwner(
	argv: string[]
): Promise<SeedOwner | null> {
	const at = argv.indexOf(OWNER_FLAG);
	if (at === -1) {
		console.warn(NO_OWNER_WARNING);
		return null;
	}
	const username = argv[at + 1]?.trim();
	if (!username) {
		fail(`${OWNER_FLAG} 后面要跟用户名，例如：${OWNER_FLAG} alice`);
	}
	const user = await getUserByUsername(username);
	if (user === null) {
		fail(
			[
				`账号「${username}」不存在，种子脚本不会替你创建账号。`,
				"先把账号弄出来再重跑本命令：",
				"  第一个管理员：pnpm db:seed-admin <用户名> [密码]",
				"  其余账号：用管理员登录后在「成员管理」页面创建",
			].join("\n")
		);
	}
	return { id: user.id, username: user.username };
}

const OUTCOME_TEXT: Record<SeedOwnerOutcome, string> = {
	added: "已设为项目 owner",
	"already-member": "已经是项目成员，角色保持原样",
	"not-requested": "未指定（该项目只有平台管理员看得见）",
};

export function ownerSummaryLine(
	owner: SeedOwner | null,
	outcome: SeedOwnerOutcome
): string {
	return `owner：${owner?.username ?? "—"}，${OUTCOME_TEXT[outcome]}`;
}
