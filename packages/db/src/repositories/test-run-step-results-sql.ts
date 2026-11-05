import { type SQL, sql } from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";

export const EMPTY_STEP_RESULTS_SQL = sql`'[]'::jsonb`;

export interface UniformStepResultsOptions {
	/** 最后一个步骤的实际结果文字。自动化把它的 message 写在这里。 */
	lastStepActualResult?: SQL;
	result: SQL;
}

/**
 * 每个步骤都是同一个判定的步骤结果。实际结果的文字写在存储键 comment 中，
 * 见 schema/run-step-results-column.ts。
 */
export function uniformStepResultsSql(options: UniformStepResultsOptions): SQL {
	const actualResult =
		options.lastStepActualResult === undefined
			? sql`null::text`
			: sql`case when s.ord = jsonb_array_length(tc.steps) then ${options.lastStepActualResult} else null::text end`;
	return sql`(
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'stepId', s.value ->> 'id',
					'result', ${options.result},
					'comment', ${actualResult}
				)
				order by s.ord
			),
			'[]'::jsonb
		)
		from ${testCases} tc, jsonb_array_elements(tc.steps) with ordinality as s(value, ord)
		where tc.id = ${testRunCases.caseId}
	)`;
}
