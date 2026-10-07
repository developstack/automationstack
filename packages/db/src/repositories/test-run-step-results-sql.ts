import { type SQL, sql } from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";

export const EMPTY_STEP_RESULTS_SQL = sql`'[]'::jsonb`;

export interface UniformStepResultsOptions {
	lastStepComment?: SQL;
	result: SQL;
}

export function uniformStepResultsSql(options: UniformStepResultsOptions): SQL {
	const comment =
		options.lastStepComment === undefined
			? sql`null::text`
			: sql`case when s.ord = jsonb_array_length(tc.steps) then ${options.lastStepComment} else null::text end`;
	return sql`(
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'stepId', s.value ->> 'id',
					'result', ${options.result},
					'comment', ${comment}
				)
				order by s.ord
			),
			'[]'::jsonb
		)
		from ${testCases} tc, jsonb_array_elements(tc.steps) with ordinality as s(value, ord)
		where tc.id = ${testRunCases.caseId}
	)`;
}
