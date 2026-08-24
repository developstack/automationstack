import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

/**
 * 项目级 Jira 接入配置（D8），一个项目至多一行。
 *
 * **「未配置」= 该项目没有本表的行**，而不是某个开关字段为 false：
 * 所有 Jira 能力都经 `getJiraClient(projectId)` 取配置，取不到即返回 null，
 * 调用方走降级分支（D9）。用「行不存在」表达未配置，删配置就是删行，
 * 不会留下「开关关着但凭据还在库里」的半吊子状态。
 */
export const jiraConfigs = pgTable(
	"jira_configs",
	{
		/**
		 * `packages/db/src/secret-box.ts` 的 `encryptSecret` 自描述密文，**绝不存明文**，
		 * 也绝不出现在任何 API 返回值里（前端只该知道「已配置 / 未配置」）。
		 * 字段名带 `Cipher` 后缀是为了让任何把明文往这里塞的代码在 review 时一眼露馅。
		 */
		apiTokenCipher: text("api_token_cipher").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** 正向创建缺陷时用的 issue type，各家 Jira 项目命名不一，故可配。 */
		defaultIssueType: text("default_issue_type").notNull().default("Bug"),
		/** Jira 账号邮箱：API Token 认证是 `email:token` 的 Basic Auth，缺一不可。 */
		email: text("email").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/** Jira 侧的 project key，如 "PAY"。 */
		projectKey: text("project_key").notNull(),
		/** 站点地址，如 https://xxx.atlassian.net。 */
		siteUrl: text("site_url").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		/** 最后改动人。删账号不该把项目的 Jira 配置一起带走，故 set null。 */
		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/**
		 * Jira Cloud webhook 的校验密钥。可空 = 只用正向创建 / 反向关联，
		 * 不开状态同步；此时 webhook 端点对该项目直接拒收。
		 */
		webhookSecret: text("webhook_secret"),
	},
	// 「一个项目至多一行」由唯一约束落到数据库层，而不是靠应用代码先查再插——
	// 两个管理员同时保存会插出两行，之后 getJiraClient 拿到哪一行就成了掷骰子。
	(table) => [unique("jira_configs_project_id_uq").on(table.projectId)]
);

export type JiraConfig = typeof jiraConfigs.$inferSelect;
export type NewJiraConfig = typeof jiraConfigs.$inferInsert;
