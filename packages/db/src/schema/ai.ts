import type {
	CasePriority as AgentCasePriority,
	CaseType as AgentCaseType,
	GenerationSessionStatus as AgentSessionStatus,
	ProposedCase,
} from "@automationstack/agent/types";
import {
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
import { type CasePriority, type CaseType, testCases } from "./test-cases";
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
 *
 * 定义已归 `@automationstack/agent`（生产这个形状的是 agent，而那个包零 db
 * 依赖、要能独立发布，不能反向 import 本文件）。这里只做同名再导出：
 * 全仓既有的 `from "@automationstack/db/schema/ai"` 一处都不用改，
 * 而 `jsonb().$type<ProposedCase>()` 存的就是 agent 定义的那一个类型本身。
 */
export type { ProposedCase } from "@automationstack/agent/types";

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
 * AI provider 的多行登记表：一行 = 一份「provider + model + base URL + API Key」
 * 的候选配置，供管理员预先登记，agent 侧配置上线后再从中选用。
 *
 * 这里是**登记处**，不是生效决策点：不设默认行、不做激活制，生成入口读哪份
 * 配置与这张表无关（见 packages/ai/src/config-store.ts 的 resolveAiConfig）。
 * 唯一性刻意不加：允许同一 provider/model 重复登记（例如同一个 model 配不同
 * base URL 的自建网关），由人而不是约束来把关。
 */
export const aiProviderConfig = pgTable("ai_provider_config", {
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
	id: uuid("id").primaryKey().defaultRandom(),
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
});

export type AiProviderConfig = typeof aiProviderConfig.$inferSelect;
export type NewAiProviderConfig = typeof aiProviderConfig.$inferInsert;

/**
 * 编译期断言辅助：`Actual` 不能赋给 `Expected` 时，这里直接 tsc 报错。
 * 只在类型层求值，不产出任何运行时代码。
 */
type AssertAssignable<Actual extends Expected, Expected> = Actual;

/**
 * 把「包定义、db 符合」这条边界钉在编译期。
 *
 * 为什么需要这三条断言：`ProposedCase` / `CaseStep` 现在是从
 * `@automationstack/agent` 再导出的，两边天然是同一个类型；但
 * `case_priority` / `case_type` / `ai_session_status` 三张 **pgEnum 仍然属于 db**
 * （迁移和数据库约束由这里管），agent 包只是平行地写了一组同取值的字符串
 * 联合——它不认识 drizzle，也不该为了几个字符串把 drizzle 拖进去。
 *
 * 平行定义的代价就是会悄悄漂移：给 pgEnum 加一个取值（比如新的用例类型）
 * 而忘了同步 agent 包，运行时才会炸在「模型提了一个 db 不认的 caseType」上，
 * 或者反过来 agent 生成了一个 pgEnum 装不下的值，落库时被 Postgres 拒掉。
 * 双向断言让这种漂移在 `turbo run check-types` 就报出来，改动的人当场就知道
 * 另一边也要跟着改。**这三条不是可有可无的装饰，删掉它们等于把编译期错误
 * 换成生产事故。**
 */
export type AgentTypeContract = [
	AssertAssignable<CasePriority, AgentCasePriority>,
	AssertAssignable<AgentCasePriority, CasePriority>,
	AssertAssignable<CaseType, AgentCaseType>,
	AssertAssignable<AgentCaseType, CaseType>,
	AssertAssignable<AiSessionStatus, AgentSessionStatus>,
	AssertAssignable<AgentSessionStatus, AiSessionStatus>,
];
