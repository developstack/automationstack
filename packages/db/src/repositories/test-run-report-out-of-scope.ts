import { and, asc, eq, notExists, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";

export interface TestRunOutOfScopeCase {
	caseId: string;
	moduleName: string;
	name: string;
	priority: CasePriority;
	sourceRef: string | null;
}

function outOfScopeCaseIds(runId: string): SQL {
	return sql`select (scope_entry ->> 'caseId')::uuid
		from ${automationExecutions}
		cross join lateral jsonb_array_elements(
			coalesce(${automationExecutions.receipt} -> 'outOfScope', '[]'::jsonb)
		) as scope_entry
		where ${automationExecutions.id} in (
			select scope_run_case.last_automation_execution_id
			from ${testRunCases} as scope_run_case
			where scope_run_case.run_id = ${runId}
				and scope_run_case.last_automation_execution_id is not null
		)
			and scope_entry ->> 'runName' is null
			and scope_entry ->> 'caseId' is not null`;
}

export function loadOutOfScopeCases(
	runId: string
): Promise<TestRunOutOfScopeCase[]> {
	return db
		.select({
			caseId: testCases.id,
			moduleName: modules.name,
			name: testCases.name,
			priority: testCases.priority,
			sourceRef: testCases.sourceRef,
		})
		.from(testCases)
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		.where(
			and(
				sql`${testCases.id} in (${outOfScopeCaseIds(runId)})`,
				notExists(
					db
						.select({ one: sql`1` })
						.from(testRunCases)
						.where(
							and(
								eq(testRunCases.runId, runId),
								eq(testRunCases.caseId, testCases.id)
							)
						)
				)
			)
		)
		.orderBy(asc(testCases.priority), asc(modules.name), asc(testCases.name));
}
