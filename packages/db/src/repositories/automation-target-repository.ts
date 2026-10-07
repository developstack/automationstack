import { sql } from "drizzle-orm";

import { db } from "../index";
import type { TestRunStatus } from "../schema/test-runs";

export interface ResolveAutomationTargetsInput {
	projectId: string;
	sourceRefs: string[];
}

export interface AutomationTargetRow {
	caseId: string;
	runCaseId: string | null;
	runId: string | null;
	runName: string | null;
	runStatus: TestRunStatus | null;
	sourceRef: string;
}

interface AutomationTargetQueryRow extends AutomationTargetRow {
	[column: string]: unknown;
}

export async function resolveAutomationTargets(
	input: ResolveAutomationTargetsInput
): Promise<AutomationTargetRow[]> {
	if (input.sourceRefs.length === 0) {
		return [];
	}
	const projectId = sql.param(input.projectId);
	const result = await db.execute<AutomationTargetQueryRow>(sql`
		select
			tc.id         as "caseId",
			tc.source_ref as "sourceRef",
			trc.id        as "runCaseId",
			tr.id         as "runId",
			tr.name       as "runName",
			tr.status     as "runStatus"
		from test_cases tc
		left join (
			test_run_cases trc
			inner join test_runs tr on tr.id = trc.run_id
		)
			on trc.case_id = tc.id
			-- 冗余但故意保留（review 结论）：正常数据下任务与它装的用例必属同一项目，
			-- 这一句永远不会多筛掉行。留着是因为这条查询的 projectId 来自外部 SDK：
			-- 它把「只能写进本项目的任务」钉进了 SQL 本身，而不是依赖
			-- 「用例属于本项目」这个需要拐一道弯才能推出的间接保证；顺带给优化器
			-- 在 test_runs 上多一个项目谓词。
			and tr.project_id = ${projectId}
			and tr.submitted_at is null
			-- 这里**刻意没有** runIds 白名单谓词：收窄在 api 层做，理由见
			-- ResolveAutomationTargetsInput 的注释；模板字符串里不能写反引号。
		where tc.project_id = ${projectId}
			and tc.source_ref = any(${sql.param(input.sourceRefs)}::text[])
		order by tc.source_ref asc, tr.created_at asc nulls first
	`);
	return result.rows;
}

export interface FindSubmittedRunBlockersInput {
	projectId: string;
	sourceRefs: string[];
}

export interface SubmittedRunBlocker {
	runName: string;
	sourceRef: string;
	submittedAt: Date;
}

interface SubmittedRunBlockerQueryRow
	extends Omit<SubmittedRunBlocker, "submittedAt"> {
	submittedAt: string;
	[column: string]: unknown;
}

export async function findSubmittedRunBlockers(
	input: FindSubmittedRunBlockersInput
): Promise<SubmittedRunBlocker[]> {
	if (input.sourceRefs.length === 0) {
		return [];
	}
	const projectId = sql.param(input.projectId);
	const result = await db.execute<SubmittedRunBlockerQueryRow>(sql`
		select distinct on (tc.source_ref)
			tc.source_ref  as "sourceRef",
			tr.name        as "runName",
			tr.submitted_at as "submittedAt"
		from test_cases tc
		inner join test_run_cases trc on trc.case_id = tc.id
		inner join test_runs tr on tr.id = trc.run_id
		where tc.project_id = ${projectId}
			and tc.source_ref = any(${sql.param(input.sourceRefs)}::text[])
			and tr.project_id = ${projectId}
			and tr.submitted_at is not null
		order by tc.source_ref asc, tr.submitted_at desc
	`);
	return result.rows.map((row) => ({
		runName: row.runName,
		sourceRef: row.sourceRef,
		submittedAt: new Date(row.submittedAt),
	}));
}
