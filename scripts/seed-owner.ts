/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

/**
 * 种子脚本共用的 `--owner <用户名>` 解析。
 *
 * 单独成文件是因为两个种子脚本都要它，而它们**必须给出同一段错误文案**：
 * 「指定的账号不存在」这条路上唯一有用的信息是「怎么把账号弄出来」，
 * 各写一份迟早会有一份说不清。
 *
 * 为什么要有这个东西：项目级授权（`packages/db/src/schema/project-members.ts`）
 * 落地之后，`project_members` 里没有行的项目对所有非管理员账号都不可见。
 * 种子脚本本来是「本地数据坏了就重建」的那条退路，不设 owner 的话它造出来的
 * 恰恰是一个谁都进不去的项目——而表现是「脚本说成功了，页面上什么都没有」。
 *
 * **种子脚本从不创建账号**（账号一律由管理员创建，平台不开放自助注册），
 * 所以这里只解析、不兜底：给了名字但库里没有这个人，就明确报错并说清下一步。
 */

import type { SeedOwnerOutcome } from "../packages/db/src/repositories/seed-repository";
import { getUserByUsername } from "../packages/db/src/repositories/users-repository";

/** process.argv 前两项是 node 与脚本路径，从第 3 项起才是用户参数。 */
export const ARGV_OFFSET = 2;

const OWNER_FLAG = "--owner";
const EXIT_FAILURE = 1;

export interface SeedOwner {
	id: string;
	username: string;
}

/** 没给 `--owner` 时的警告。写成大段而不是一句：这里要说清后果与出路。 */
const NO_OWNER_WARNING = [
	`⚠️  没有指定 ${OWNER_FLAG}：种子项目不会有任何成员。`,
	"   后果是它只对平台管理员可见，普通账号登录后项目列表仍然是空的。",
	`   要让某个账号能进去，给本命令加上 ${OWNER_FLAG} <用户名> 再跑一次。`,
].join("\n");

function fail(message: string): never {
	console.error(message);
	process.exit(EXIT_FAILURE);
}

/**
 * 从 argv 里解析 `--owner <用户名>` 并查出这个人。
 *
 * 三种结局各自明确，**没有一种是静默跳过**：
 * - 没给这个参数 → 打印警告，返回 null（沿用旧行为，但用户知道自己会得到什么）
 * - 给了但没跟名字 / 名字查不到人 → 直接退出并说清怎么办
 * - 查到了 → 返回 id 与库里的用户名（用库里的，免得大小写与用户敲的不一致）
 */
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

/** 种子脚本收尾时打印的那一行 owner 结论。 */
export function ownerSummaryLine(
	owner: SeedOwner | null,
	outcome: SeedOwnerOutcome
): string {
	return `owner：${owner?.username ?? "—"}，${OUTCOME_TEXT[outcome]}`;
}
