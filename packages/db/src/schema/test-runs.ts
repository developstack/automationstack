import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { automationExecutions } from "./automation-executions";
import { projects } from "./projects";
import { runStepResultsJsonb } from "./run-step-results-column";
import { testCases } from "./test-cases";
import {
	testRunCaseResultEnum,
	testRunExecutedViaEnum,
	testRunStatusEnum,
} from "./test-run-enums";
import { users } from "./users";

export type {
	RunCaseStepResult,
	TestRunAttachmentKind,
	TestRunCaseResult,
	TestRunExecutedVia,
	TestRunStatus,
	TestRunStepResult,
} from "./test-run-enums";
// biome-ignore lint/performance/noBarrelFile: 兼容性 re-export，不是 barrel——这四个枚举本来就定义在本文件里，拆去 test-run-enums.ts 只为行数上限，导入路径必须保持不变
export {
	testRunAttachmentKindEnum,
	testRunCaseResultEnum,
	testRunExecutedViaEnum,
	testRunStatusEnum,
} from "./test-run-enums";

export const testRuns = pgTable(
	"test_runs",
	{
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		description: text("description"),
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		reviewedBy: uuid("reviewed_by").references(() => users.id, {
			onDelete: "set null",
		}),
		startedAt: timestamp("started_at", { withTimezone: true }),
		status: testRunStatusEnum("status").notNull().default("pending_review"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		submittedBy: uuid("submitted_by").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		voidedAt: timestamp("voided_at", { withTimezone: true }),
		voidedBy: uuid("voided_by").references(() => users.id, {
			onDelete: "set null",
		}),
		voidReason: text("void_reason"),
	},
	(table) => [
		index("test_runs_project_id_status_idx").on(table.projectId, table.status),
		index("test_runs_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc()
		),
		check(
			"test_runs_submitted_consistency",
			sql`(${table.status} = 'submitted') = (${table.submittedAt} is not null)`
		),
	]
);

export type TestRun = typeof testRuns.$inferSelect;
export type NewTestRun = typeof testRuns.$inferInsert;

export const testRunCases = pgTable(
	"test_run_cases",
	{
		assigneeId: uuid("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		caseId: uuid("case_id")
			.notNull()
			.references(() => testCases.id, { onDelete: "restrict" }),
		caseVersion: integer("case_version"),
		comment: text("comment"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		executedAt: timestamp("executed_at", { withTimezone: true }),
		executedBy: uuid("executed_by").references(() => users.id, {
			onDelete: "set null",
		}),
		executedVia: testRunExecutedViaEnum("executed_via"),
		id: uuid("id").primaryKey().defaultRandom(),
		lastAutomationExecutionId: uuid("last_automation_execution_id").references(
			() => automationExecutions.id,
			{ onDelete: "set null" }
		),
		result: testRunCaseResultEnum("result").notNull().default("untested"),
		runId: uuid("run_id")
			.notNull()
			.references(() => testRuns.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		stepResults: runStepResultsJsonb("step_results")
			.notNull()
			.default(sql`'[]'::jsonb`),
	},
	(table) => [
		unique("test_run_cases_run_id_case_id_uq").on(table.runId, table.caseId),
		index("test_run_cases_run_id_result_idx").on(table.runId, table.result),
		index("test_run_cases_case_id_executed_at_desc_idx").on(
			table.caseId,
			table.executedAt.desc()
		),
	]
);

export type TestRunCase = typeof testRunCases.$inferSelect;
export type NewTestRunCase = typeof testRunCases.$inferInsert;
