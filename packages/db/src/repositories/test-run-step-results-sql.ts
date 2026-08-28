/**
 * 「整条用例一个结论」时，`step_results` 那一列的写法——**一份 SQL，三条写路径共用**。
 *
 * 用得到它的是三个入口：手工单条（`setRunCaseResult`）、手工批量（「一键全部通过」）、
 * 自动化上报。三者都只有一个用例级结论，要把它铺到每一步上；区别只在自动化那条
 * 还要把失败信息落到**最后一步**（用户定的：脚本目前只有整条通过/失败，
 * 原因先填最后一步，将来脚本细化了再改这里一处）。
 *
 * ## 为什么是相关子查询，不是先查步骤再回填
 *
 * 步骤存在 `test_cases.steps` 这个 jsonb 里，跟 `case_version` 那一列面对的是
 * 同一个问题、同一个答案（见 `buildResultPatch` 里那条子查询的旁注）：中间隔一次
 * 往返，别人正好保存了新版本，写下的就会是一份这条结论从没见过的步骤表。
 * 就地取还顺带省掉了批量路径上的 N 次查询。
 *
 * ## 逐列对齐
 *
 * 手工路径走 `buildResultPatch` 的 `.set()`，自动化走 `FROM (VALUES ...)` 的原生
 * UPDATE，两条 SQL 的写法本来就不同。把这一列的表达式提到这里，是让「三条路径
 * 写进 step_results 的东西必须一致」变成结构上的事实，而不是一条要人记得的注释。
 */
import { type SQL, sql } from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";

/** 没有步骤的用例、以及回退成未测时写的值。 */
export const EMPTY_STEP_RESULTS_SQL = sql`'[]'::jsonb`;

export interface UniformStepResultsOptions {
	/**
	 * 落到**最后一步** comment 上的表达式；其余步骤恒为 null。
	 * 不给表示每一步都没有原因（手工的两条路径就是这样——用户级说明由分步
	 * 反过来推导，见 `buildCaseComment`，不存在「一个说明铺到每一步」的语义）。
	 */
	lastStepComment?: SQL;
	/** 结论表达式，求值结果必须是 text：手工是字面量，自动化是 `v.result::text`。 */
	result: SQL;
}

/**
 * 把一个用例级结论铺满该用例当前的每一个步骤。
 *
 * 顺序由 `with ordinality` 的 `ord` 定死，与 `test_cases.steps` 数组顺序一致；
 * `jsonb_agg` 不带 order by 时的顺序是没有保证的，这里不能省。
 * 步骤为空数组时 `from` 一行都不产出，`jsonb_agg` 返回 NULL，由 coalesce 收成
 * `[]`——没有步骤的用例因此自动得到空结果，不需要调用方额外分支。
 *
 * `null::text` 而不是裸 `null`：`jsonb_build_object` 是多态函数，
 * 给它一个推不出类型的 NULL 会当场报错。
 */
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
