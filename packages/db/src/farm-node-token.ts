/**
 * 实机节点凭据的明文生成与哈希（plan §12）。
 *
 * 纯函数模块，与 `api-token.ts` 同一条纪律：不 import `../index`、不 import 任何
 * schema 值——只有这样它才进得了 vitest 的 `db` project（那边不连库、没有
 * `DATABASE_URL`，见根 `vitest.config.ts` 的注释）。
 *
 * ## 为什么复用 api token 那一套，而不是自成一套
 *
 * 哈希直接用 `hashApiToken`、随机体直接用 `generateTokenRandomBody`，**一个字节
 * 都不重新实现**。凭据校验的失败模式是静默的：换了字母表、大写十六进制、少哈希了
 * 前缀，表现全都是「已发出去的凭据集体失效」，不会有任何一处报错。系统里只该有
 * 一套摘要口径，两套并存的那一天没人认得出是哪一套在生效。
 *
 * 慢哈希（`password.ts` 的 PBKDF2）在这里同样不适用，理由与 api token 逐字相同：
 * 鉴权是一次 `WHERE token_hash = ?` 的索引命中，而 32 字节 CSPRNG 没有爆破面。
 *
 * ## 前缀为什么是 `as_node_`
 *
 * 节点凭据与个人 API token 走的是**两条完全不同的鉴权链路**（前者认一台机器，
 * 后者认一个人），拿错了必须当场看得出来。前缀不同，日志里一眼分得开，
 * 而且鉴权入口可以在算哈希之前就先按前缀否掉一半的误用。
 *
 * ⚠️ 仓库文档里出现过的 `as_live_` 是历史写法，实际发出去的个人 token 前缀是
 * `as_`（见 `api-token.ts` 的 `API_TOKEN_PREFIX`）。这里**不去动那边**，
 * 节点凭据就用 `as_node_`。
 */

import { generateTokenRandomBody, hashApiToken } from "./api-token";

/** 明文的固定前缀。改它等于让全部存量节点凭据静默失效，只能在没有存量时改。 */
export const FARM_NODE_TOKEN_PREFIX = "as_node_";

/**
 * 算节点凭据的哈希。**刻意是 `hashApiToken` 的一层薄转发**，不是另一份实现：
 * 转发让 farm 那边的调用点读起来是「哈希一个节点凭据」，而实际生效的摘要口径
 * 全仓只有一处；哪天真要给节点换算法，也只需要改这一个函数体。
 *
 * 哈希的是**含 `as_node_` 前缀的完整明文**——agent 从配置里读到的就是完整串，
 * 中途剥前缀只会多出一个「两边都得记得剥」的步骤，而一旦有一边忘了，表现是
 * 鉴权静默失败而不是报错。
 */
export function hashFarmNodeToken(plaintext: string): Promise<string> {
	return hashApiToken(plaintext);
}

export interface GeneratedFarmNodeToken {
	plaintext: string;
	tokenHash: string;
}

/**
 * 生成一份新的节点凭据。`plaintext` 是这辈子唯一一次能拿到明文的地方
 * （创建与轮换各返回一次，之后库里只剩哈希）。
 */
export async function generateFarmNodeToken(): Promise<GeneratedFarmNodeToken> {
	const plaintext = `${FARM_NODE_TOKEN_PREFIX}${generateTokenRandomBody()}`;
	return { plaintext, tokenHash: await hashFarmNodeToken(plaintext) };
}
