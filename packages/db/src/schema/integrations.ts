import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

export const jiraConfigs = pgTable(
	"jira_configs",
	{
		apiTokenCipher: text("api_token_cipher").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		defaultIssueType: text("default_issue_type").notNull().default("Bug"),
		email: text("email").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		projectKey: text("project_key").notNull(),
		siteUrl: text("site_url").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
		webhookSecret: text("webhook_secret"),
	},
	(table) => [unique("jira_configs_project_id_uq").on(table.projectId)]
);

export type JiraConfig = typeof jiraConfigs.$inferSelect;
export type NewJiraConfig = typeof jiraConfigs.$inferInsert;
