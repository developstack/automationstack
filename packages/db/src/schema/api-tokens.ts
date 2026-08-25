/**
 * 个人 API Token（plan §3.1）：一个人可以有多枚，权限严格等于其主人。
 *
 * 库里只存 SHA-256，明文只在创建响应里出现一次——生成与哈希的口径全在
 * `packages/db/src/api-token.ts`，那里也写清了为什么不用 PBKDF2、
 * 更不用 `jira_configs.apiTokenCipher` 那种可逆密文。
 *
 * ## 吊销写 `revokedAt`，而不是删行
 *
 * 删了行，`lastUsedAt` 一起没了，「这枚泄露的 token 最后一次被用是什么时候」
 * 这个唯一有用的问题就答不出来了——而这恰恰是吊销发生时最想问的问题。
 * 代价是所有鉴权查询**一律要带 `revokedAt IS NULL`**；漏带一次等于吊销失效，
 * 所以写路径只留 `findActiveApiTokenByHash` 一个入口。
 *
 * 列表页照样返回已吊销的行（前端要显示「已吊销」状态），过滤只发生在鉴权路径。
 *
 * ## `onDelete: cascade` 在这里是安全的
 *
 * 删账号连它的 token 一起失效，正是想要的语义。这跟 `test_runs.submittedBy`
 * 那条 `set null` 不冲突：那里的 null 承载语义（「提交人已不可考」仍是一份
 * 有效的报告），这里不承载——一枚没有主人的 token 不是任何东西，只是个洞。
 *
 * ## 依赖方向
 *
 * 本表只向上引用 `users`，`schema/users.ts` 绝不反向引用它。理由见
 * `case-attachments.ts` / `test-run-attachments.ts` 顶部：pgEnum 在模块求值期
 * 取值，schema 之间一旦成环就直接炸在 TDZ 上。
 */

import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const apiTokens = pgTable(
	"api_tokens",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		/**
		 * 每次成功鉴权后更新，但**一分钟内只写一次**（节流谓词在
		 * `repositories/api-tokens-repository.ts` 的 SQL 里）。可空 = 从没被用过。
		 */
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		/** 用户自己起的备注名，如「我的 MacBook」。纯展示，不参与任何寻址。 */
		name: text("name").notNull(),
		/**
		 * 明文前 11 位（`as_` + 8 个随机字符），列表页展示用——明文之后再也拿不到，
		 * 没有这一列用户就无从判断自己要吊销的是哪一枚。
		 * 刻意不加唯一约束：它只是明文的一段，撞了也无所谓。
		 */
		prefix: text("prefix").notNull(),
		/** 非空 = 已吊销，鉴权立即失效；行仍在，`lastUsedAt` 仍可查。 */
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		/** `api-token.ts` 算出的 SHA-256 小写十六进制，**绝不存明文**。 */
		tokenHash: text("token_hash").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		// 鉴权路径就是拿哈希做等值查找，唯一约束顺带把索引也建了。
		// 它同时是「同一枚 token 绝不会在库里出现两行」的最后一道保险——
		// 真撞上了（宇宙热寂级别的概率）也是插入失败，而不是鉴权时掷骰子选一行。
		unique("api_tokens_token_hash_uq").on(table.tokenHash),
		// 唯一的列表查法：某人的全部 token 按创建时间倒序。
		index("api_tokens_user_id_created_at_desc_idx").on(
			table.userId,
			table.createdAt.desc()
		),
	]
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

/**
 * 可以安全下发到前端的字段：**没有 `tokenHash`**。
 *
 * 与 `PublicUser` 同档，且同样是独立声明的接口 + 逐字段手工构造——刻意不用
 * `Omit<ApiToken, "tokenHash">` 再 spread：后者在给表加新的敏感列时会静默地
 * 把它带出去，独立接口则会在编译期少一个字段就报错
 * （理由原文见 `packages/api/src/routers/jira.ts` 的文件头）。
 */
export interface ApiTokenView {
	createdAt: Date;
	id: string;
	lastUsedAt: Date | null;
	name: string;
	prefix: string;
	revokedAt: Date | null;
}

export function toApiTokenView(row: ApiToken): ApiTokenView {
	return {
		createdAt: row.createdAt,
		id: row.id,
		lastUsedAt: row.lastUsedAt,
		name: row.name,
		prefix: row.prefix,
		revokedAt: row.revokedAt,
	};
}
