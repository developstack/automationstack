import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
	API_TOKEN_LAST_USED_THROTTLE_SECONDS,
	generateApiToken,
} from "../api-token";
import { db } from "../index";
import {
	type ApiTokenView,
	apiTokens,
	toApiTokenView,
} from "../schema/api-tokens";
import type { RepositoryNotFound } from "./repository-types";

export interface CreateApiTokenInput {
	name: string;
	userId: string;
}

/** 创建的返回值是**唯一一次**明文出现的地方，之后任何接口都取不到。 */
export interface CreatedApiToken {
	plaintext: string;
	token: ApiTokenView;
}

export interface RevokeApiTokenInput {
	id: string;
	userId: string;
}

/**
 * 成功分支自带 `kind`，与仓库里其它 `RepositoryNotFound` 联合同一形状
 * （`RemoveTestCaseResult` / `CaseWriteResult` / 附件那两个）：调用方一律
 * `switch (result.kind)` 收窄，不用为这一个函数改写成 `"kind" in result`。
 */
export type RevokeApiTokenResult =
	| RepositoryNotFound
	| { kind: "revoked"; token: ApiTokenView };

/** 鉴权命中后要往上带的全部信息：token 本身只回答「这是谁」。 */
export interface ActiveApiToken {
	id: string;
	userId: string;
}

export async function createApiToken(
	input: CreateApiTokenInput
): Promise<CreatedApiToken> {
	const generated = await generateApiToken();
	const [row] = await db
		.insert(apiTokens)
		.values({
			name: input.name,
			prefix: generated.prefix,
			tokenHash: generated.tokenHash,
			userId: input.userId,
		})
		.returning();
	if (!row) {
		throw new Error("创建 API Token 失败：插入没有返回行");
	}
	return { plaintext: generated.plaintext, token: toApiTokenView(row) };
}

/**
 * 某人的全部 token，创建时间倒序。
 * **已吊销的行照样返回**：前端要把它们显示成「已吊销」，用户才看得见
 * 自己确实吊销过、以及那枚 token 最后一次被用是什么时候。
 *
 * 显式选列而不是 `select()` 全列：`token_hash` 没有任何理由离开 Postgres。
 * 列表页一次就拉一个人的全部 token，全列查询等于把每一份凭据的哈希都搬进
 * Node 堆里，然后指望下游每一处（日志、错误上报、序列化）都记得别把它带出去。
 * 少查一列，这些地方就全都不必记得了。
 *
 * 返回类型标成 `ApiTokenView[]`，选列漏一个或多一个都会在编译期报错。
 */
export function listApiTokensByUser(userId: string): Promise<ApiTokenView[]> {
	return db
		.select({
			createdAt: apiTokens.createdAt,
			id: apiTokens.id,
			lastUsedAt: apiTokens.lastUsedAt,
			name: apiTokens.name,
			prefix: apiTokens.prefix,
			revokedAt: apiTokens.revokedAt,
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.orderBy(desc(apiTokens.createdAt));
}

/**
 * 吊销一枚 token。
 *
 * `user_id` 这个条件是**越权吊销别人 token 的唯一防线**，不能指望上层先查一次
 * 归属再调这里——那中间就有一个窗口，而且每多一个调用方就多一次漏查的机会。
 * 归属不符与「行不存在」一并走 not-found，不区分：区分了就等于告诉调用者
 * 「这个 id 存在，只是不归你」，那本身就是一次信息泄露。
 *
 * 重复吊销同一枚也走 not-found（`revoked_at IS NULL` 没匹配上），
 * 这样 `revokedAt` 永远保留**第一次**吊销的时刻，不会被后来的重试冲掉。
 */
export async function revokeApiToken(
	input: RevokeApiTokenInput
): Promise<RevokeApiTokenResult> {
	const [row] = await db
		.update(apiTokens)
		// 时钟以数据库为准，与 `createdAt` 的 defaultNow 同一个来源，
		// 免得多实例的机器时间偏差让「吊销早于创建」这种行出现在库里。
		.set({ revokedAt: sql`now()` })
		.where(
			and(
				eq(apiTokens.id, input.id),
				eq(apiTokens.userId, input.userId),
				isNull(apiTokens.revokedAt)
			)
		)
		.returning();
	return row
		? { kind: "revoked", token: toApiTokenView(row) }
		: { kind: "not-found" };
}

/**
 * 鉴权路径：按哈希取未吊销的 token，只回 `id` 与 `userId`。
 *
 * ⚠️ **这里刻意不读 users 表**。账号是否停用（`disabledAt`）属于上层判断：
 * 校验链会复用 `context.ts` 里已有的那次 users 读库拿 `disabledAt` / `role`，
 * 与会话走的是同一套判据。在这里再查一次 users，就是在系统里造了第二套
 * 「账号还有效吗」的规则，两套迟早会分叉——而分叉的表现是停用的账号还能
 * 用 token 上报，没有任何地方会报错。
 */
export async function findActiveApiTokenByHash(
	tokenHash: string
): Promise<ActiveApiToken | null> {
	const [row] = await db
		.select({ id: apiTokens.id, userId: apiTokens.userId })
		.from(apiTokens)
		.where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
		.limit(1);
	return row ?? null;
}

/**
 * 记一次「这枚 token 刚被用过」，节流窗口内重复调用是空操作。
 *
 * 节流做在 **SQL 谓词里**，不在进程内：用一个 `Map<tokenId, lastWrite>` 看起来
 * 更省事，但多实例部署下每个进程各节流各的，窗口形同虚设；而且那个 Map 的键
 * 是 token id，无界增长，等于在最热的路径上挂了个漏内存的缓存。
 * 谓词版没有这两个问题——判据在数据库那一份数据上，几个实例看到的是同一个。
 *
 * 不匹配就不写，因此这个函数对调用方永远成功，也永远不该阻塞上报：
 * `lastUsedAt` 是审计信息，写丢一次不影响任何鉴权判断。
 */
export async function touchApiTokenLastUsed(id: string): Promise<void> {
	await db
		.update(apiTokens)
		.set({ lastUsedAt: sql`now()` })
		.where(
			and(
				eq(apiTokens.id, id),
				sql`(${apiTokens.lastUsedAt} is null or ${apiTokens.lastUsedAt} < now() - (${API_TOKEN_LAST_USED_THROTTLE_SECONDS} || ' seconds')::interval)`
			)
		);
}
