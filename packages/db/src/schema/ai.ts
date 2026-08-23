import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { modules } from "./modules";
import { projects } from "./projects";
import {
	type CasePriority,
	type CaseStep,
	type CaseType,
	testCases,
} from "./test-cases";
import { users } from "./users";

export const aiSessionStatusEnum = pgEnum("ai_session_status", [
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
]);

export const aiProposalStatusEnum = pgEnum("ai_proposal_status", [
	"proposed",
	"accepted",
	"rejected",
]);

export type AiSessionStatus = (typeof aiSessionStatusEnum.enumValues)[number];
export type AiProposalStatus = (typeof aiProposalStatusEnum.enumValues)[number];

/**
 * A test case proposed by the AI generation agent, stored in
 * ai_case_proposals.proposal until it is accepted into test_cases.
 */
export interface ProposedCase {
	caseType: CaseType;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	steps: CaseStep[];
	tags: string[];
}

export const aiGenerationSessions = pgTable("ai_generation_sessions", {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	error: text("error"),
	id: uuid("id").primaryKey().defaultRandom(),
	model: text("model").notNull(),
	moduleId: uuid("module_id").references(() => modules.id, {
		onDelete: "set null",
	}),
	projectId: uuid("project_id")
		.notNull()
		.references(() => projects.id, { onDelete: "cascade" }),
	requirement: text("requirement").notNull(),
	status: aiSessionStatusEnum("status").notNull().default("pending"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type AiGenerationSession = typeof aiGenerationSessions.$inferSelect;
export type NewAiGenerationSession = typeof aiGenerationSessions.$inferInsert;

export const aiCaseProposals = pgTable(
	"ai_case_proposals",
	{
		acceptedCaseId: uuid("accepted_case_id").references(() => testCases.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		proposal: jsonb("proposal").$type<ProposedCase>().notNull(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => aiGenerationSessions.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		status: aiProposalStatusEnum("status").notNull().default("proposed"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	// getSession 按 sessionId 拉整个会话的提案并按 sortOrder 排序，
	// 复合索引让该查询免于全表扫描 + 排序。
	(table) => [
		index("ai_case_proposals_session_id_sort_order_idx").on(
			table.sessionId,
			table.sortOrder
		),
	]
);

export type AiCaseProposal = typeof aiCaseProposals.$inferSelect;
export type NewAiCaseProposal = typeof aiCaseProposals.$inferInsert;

/**
 * 全局唯一那一行的固定主键。
 *
 * 「平台级唯一一份配置」用固定单例主键 + CHECK 约束落到数据库层面，而不是靠
 * 应用代码「先查再插」：后者在两个管理员同时保存时会插出两行。
 * 相比「在常量表达式上建唯一索引」，固定主键还顺带让写入退化成一条
 * `insert ... on conflict (id) do update`，不需要先读一次。
 */
export const AI_PROVIDER_CONFIG_ID = 1;

export const aiProviderConfig = pgTable(
	"ai_provider_config",
	{
		/**
		 * `packages/db/src/secret-box.ts` 的自描述密文串，绝不存明文，
		 * 也绝不出现在任何 API 返回值里。可空 = 管理员尚未填 / 主动清空。
		 */
		apiKeyCiphertext: text("api_key_ciphertext"),
		/**
		 * OpenAI 兼容端点。models.dev 只对 167/193 个 provider 给了 `api` 字段，
		 * 其余（anthropic、openai、google 等走官方 SDK 的）拿不到默认值，
		 * 所以这里是必填字段而不是从 provider id 推导出来的。
		 */
		baseUrl: text("base_url").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: integer("id").primaryKey().default(AI_PROVIDER_CONFIG_ID),
		/** AI SDK 使用的 model id，如 `claude-sonnet-4-5`。 */
		modelId: text("model_id").notNull(),
		/** models.dev 的 provider id，如 `anthropic`、`deepseek`。 */
		providerId: text("provider_id").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		/** 最后改动人。删账号不该把这行配置一起带走，故 set null。 */
		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	// 单例 CHECK：`sql.raw` 而不是插值，是为了让 drizzle-kit 把常量直接写进
	// DDL——插值会生成绑定参数占位符，CHECK 约束里放占位符是非法的。
	(table) => [
		check(
			"ai_provider_config_singleton",
			sql`${table.id} = ${sql.raw(String(AI_PROVIDER_CONFIG_ID))}`
		),
	]
);

export type AiProviderConfig = typeof aiProviderConfig.$inferSelect;
export type NewAiProviderConfig = typeof aiProviderConfig.$inferInsert;
