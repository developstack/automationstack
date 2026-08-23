import { sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";

/**
 * 列出一个项目下所有用例用过的标签（去重 + 按标签名升序）。
 *
 * `test_cases.tags` 是 jsonb 里的 string[]，用 `jsonb_array_elements_text`
 * 做横向展开（lateral join）后再 distinct；空数组的行自然不产生任何 tag 行，
 * 因此项目没有用例、或所有用例都没打标签时返回 `[]`。
 *
 * 刻意不接受状态/模块等筛选参数：这是给前端筛选器填选项用的最小只读接口，
 * 「候选标签」应覆盖项目内的全部用例，按状态裁剪反而会让已有筛选项消失。
 *
 * 排序走数据库默认排序规则（collation），跨环境的相对顺序可能有差异，
 * 但同一库内稳定，足以保证前端渲染顺序不抖动。
 *
 * 注意 projectId 用 sql.param 显式绑定，与 buildTagsCondition 同一套习惯。
 */
export async function listProjectCaseTags(
	projectId: string
): Promise<string[]> {
	const result = await db.execute<{ tag: string }>(sql`
		select distinct tag
		from ${testCases}, jsonb_array_elements_text(${testCases.tags}) as tag
		where ${testCases.projectId} = ${sql.param(projectId)}
		order by tag
	`);
	return result.rows.map((row) => row.tag);
}
